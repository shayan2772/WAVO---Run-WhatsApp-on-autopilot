import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { renderTemplate } from '../../common/utils/template-render';
import { ShutdownService } from '../../common/services/shutdown.service';
import { SessionService } from '../session/session.service';
import { MessageService } from '../message/message.service';
import { SessionStatus } from '../session/entities/session.entity';
import { Contact } from '../audience/entities/contact.entity';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignRecipient, RecipientStatus } from './entities/campaign-recipient.entity';
import { NumberHealth, HealthState } from './entities/number-health.entity';
import { warmupTierForAge, numberAgeDays } from './warmup.config';

const TICK_MS = 5000;
const FAILURE_THROTTLE_THRESHOLD = 5;

// The anti-ban sender. A single in-process pacer (the deployment target is one VPS) that, every tick,
// lets each healthy number in a running campaign send at most one message — gated by a jittered
// inter-message delay, a per-number daily cap, the warm-up tier, and the send window. Durable: the
// CampaignRecipient rows are the cursor, so a restart resumes exactly where it left off. For a
// multi-replica deployment this loop would move to a BullMQ repeatable job (singleton across replicas).
@Injectable()
export class CampaignPacerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CampaignPacer');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    @InjectRepository(Campaign, 'data') private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignRecipient, 'data') private readonly recipientRepo: Repository<CampaignRecipient>,
    @InjectRepository(NumberHealth, 'data') private readonly healthRepo: Repository<NumberHealth>,
    @InjectRepository(Contact, 'data') private readonly contactRepo: Repository<Contact>,
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    @Optional() private readonly shutdownService?: ShutdownService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Boot resume: any recipient left mid-send by a crash goes back to PENDING (single process, safe).
    try {
      await this.recipientRepo.update({ status: RecipientStatus.SENDING }, { status: RecipientStatus.PENDING });
    } catch {
      /* schema may not exist yet on very first boot */
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    if (this.shutdownService?.isShuttingDown()) return;
    this.busy = true;
    try {
      const campaigns = await this.campaignRepo.find({
        where: [{ status: CampaignStatus.RUNNING }, { status: CampaignStatus.SCHEDULED }],
      });
      for (const campaign of campaigns) {
        await this.processCampaign(campaign).catch(err =>
          this.logger.error(`Campaign ${campaign.id} tick failed`, String(err)),
        );
      }
    } finally {
      this.busy = false;
    }
  }

  private async processCampaign(campaign: Campaign): Promise<void> {
    // Promote a scheduled campaign once its start time arrives.
    if (campaign.status === CampaignStatus.SCHEDULED) {
      const startAt = campaign.schedule?.startAt ? new Date(campaign.schedule.startAt).getTime() : 0;
      if (!startAt || startAt > Date.now()) return;
      campaign.status = CampaignStatus.RUNNING;
      campaign.startedAt = new Date();
      await this.campaignRepo.save(campaign);
    }

    if (!this.withinWindow(campaign)) return;

    // Completion: nothing pending or in-flight → done.
    const pending = await this.recipientRepo.count({
      where: { campaignId: campaign.id, status: RecipientStatus.PENDING },
    });
    if (pending === 0) {
      const sending = await this.recipientRepo.count({
        where: { campaignId: campaign.id, status: RecipientStatus.SENDING },
      });
      if (sending === 0) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completedAt = new Date();
        await this.campaignRepo.save(campaign);
        this.logger.log(`Campaign completed: ${campaign.name}`, { campaignId: campaign.id });
      }
      return;
    }

    // Each healthy number gets a chance to send one message this tick (numbers run in parallel).
    for (const sessionId of campaign.sessionIds) {
      await this.trySendOne(campaign, sessionId).catch(err =>
        this.logger.error(`send failed on ${sessionId}`, String(err)),
      );
    }
  }

  private async trySendOne(campaign: Campaign, sessionId: string): Promise<void> {
    // Number must be connected/READY.
    const session = await this.sessionService.findOne(sessionId).catch(() => null);
    if (!session || session.status !== SessionStatus.READY) return;

    const health = await this.getHealth(sessionId, session.connectedAt);
    if (health.healthState === HealthState.PAUSED) return;
    this.rollDay(health);

    const tier = warmupTierForAge(numberAgeDays(health.firstReadyAt));
    const dailyCap = Math.min(campaign.schedule?.dailyCapPerNumber ?? tier.dailyCap, tier.dailyCap);
    if (health.sentToday >= dailyCap) return;

    // Jittered inter-message delay gate (larger for newer numbers).
    const minD = campaign.schedule?.interMessageDelayMinMs ?? tier.minDelayMs;
    const maxD = campaign.schedule?.interMessageDelayMaxMs ?? tier.maxDelayMs;
    const required = minD + Math.random() * Math.max(0, maxD - minD);
    const last = health.lastSentAtMs ? Number(health.lastSentAtMs) : 0;
    if (Date.now() - last < required) return;

    // Claim the next pending recipient (CAS PENDING→SENDING so a restart can never double-send).
    const recipient = await this.recipientRepo.findOne({
      where: { campaignId: campaign.id, status: RecipientStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    if (!recipient) return;
    const claim = await this.recipientRepo.update(
      { id: recipient.id, status: RecipientStatus.PENDING },
      { status: RecipientStatus.SENDING, assignedSessionId: sessionId, attempt: recipient.attempt + 1 },
    );
    if (!claim.affected) return;

    // Opt-out re-check (a STOP may have arrived after materialization).
    const contact = await this.contactRepo.findOne({ where: { id: recipient.contactId }, select: ['id', 'optedOut'] });
    if (contact?.optedOut) {
      await this.recipientRepo.update({ id: recipient.id }, { status: RecipientStatus.SKIPPED });
      await this.campaignRepo.increment({ id: campaign.id }, 'skippedCount', 1);
      return;
    }

    try {
      const messageId = await this.send(campaign, sessionId, recipient);
      await this.recipientRepo.update(
        { id: recipient.id },
        { status: RecipientStatus.SENT, waMessageId: messageId, sentAt: new Date() },
      );
      await this.campaignRepo.increment({ id: campaign.id }, 'sentCount', 1);
      health.sentToday += 1;
      health.lastSentAtMs = String(Date.now());
      health.consecutiveFailures = 0;
      health.healthState = HealthState.HEALTHY;
      await this.healthRepo.save(health);
    } catch (err) {
      await this.recipientRepo.update(
        { id: recipient.id },
        { status: RecipientStatus.FAILED, error: String(err).slice(0, 500) },
      );
      await this.campaignRepo.increment({ id: campaign.id }, 'failedCount', 1);
      health.consecutiveFailures += 1;
      health.lastSentAtMs = String(Date.now());
      if (health.consecutiveFailures >= FAILURE_THROTTLE_THRESHOLD) {
        health.healthState = HealthState.THROTTLED;
        this.logger.warn(`Number ${sessionId} throttled after repeated failures`, { sessionId });
      }
      await this.healthRepo.save(health);
    }
  }

  private async send(campaign: Campaign, sessionId: string, recipient: CampaignRecipient): Promise<string | null> {
    const chatId = `${recipient.phone}@c.us`;
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(recipient.attributes ?? {})) vars[k] = v == null ? '' : String(v);
    // `phone` is a top-level column (not in attributes) — expose it so `{{phone}}` renders.
    vars.phone = recipient.phone;
    const tpl = campaign.messageTemplate;
    const caption = tpl.caption ? renderTemplate(tpl.caption, vars) : undefined;
    // Media source: an uploaded file (base64) takes precedence over a remote URL.
    const media = tpl.mediaBase64
      ? { base64: tpl.mediaBase64, mimetype: tpl.mediaMimetype }
      : { url: tpl.mediaUrl };

    let res;
    switch (tpl.type) {
      case 'image':
        res = await this.messageService.sendImage(sessionId, { chatId, ...media, caption });
        break;
      case 'video':
        res = await this.messageService.sendVideo(sessionId, { chatId, ...media, caption });
        break;
      case 'document':
        res = await this.messageService.sendDocument(sessionId, { chatId, ...media, caption, filename: tpl.filename });
        break;
      case 'text':
      default:
        res = await this.messageService.sendText(sessionId, { chatId, text: renderTemplate(tpl.text ?? '', vars) });
        break;
    }
    return res?.messageId ?? null;
  }

  private async getHealth(sessionId: string, connectedAt: Date | null): Promise<NumberHealth> {
    let health = await this.healthRepo.findOne({ where: { sessionId } });
    if (!health) {
      health = await this.healthRepo.save(
        this.healthRepo.create({ sessionId, firstReadyAt: connectedAt ?? new Date(), healthState: HealthState.HEALTHY }),
      );
    } else if (!health.firstReadyAt && connectedAt) {
      health.firstReadyAt = connectedAt;
    }
    return health;
  }

  private rollDay(health: NumberHealth): void {
    const todayKey = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    if (health.dayKey !== todayKey) {
      health.dayKey = todayKey;
      health.sentToday = 0;
    }
  }

  private withinWindow(campaign: Campaign): boolean {
    const { windowStartHour, windowEndHour, timezone } = campaign.schedule ?? {};
    if (windowStartHour == null || windowEndHour == null) return true;
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone || 'UTC' }).format(
        new Date(),
      ),
    );
    return windowStartHour <= windowEndHour
      ? hour >= windowStartHour && hour < windowEndHour
      : hour >= windowStartHour || hour < windowEndHour; // overnight window
  }
}
