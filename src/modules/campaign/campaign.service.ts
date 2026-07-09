import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { createLogger } from '../../common/services/logger.service';
import { AudienceService } from '../audience/audience.service';
import { Campaign, CampaignStatus, CampaignMessageTemplate, CampaignSchedule } from './entities/campaign.entity';
import { CampaignRecipient, RecipientStatus } from './entities/campaign-recipient.entity';

export interface CreateCampaignInput {
  name: string;
  messageTemplate: CampaignMessageTemplate;
  targetListIds: string[];
  sessionIds: string[];
  schedule?: CampaignSchedule;
}

@Injectable()
export class CampaignService {
  private readonly logger = createLogger('CampaignService');

  constructor(
    @InjectRepository(Campaign, 'data') private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignRecipient, 'data') private readonly recipientRepo: Repository<CampaignRecipient>,
    private readonly audience: AudienceService,
  ) {}

  list(businessId: string): Promise<Campaign[]> {
    return this.campaignRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async get(businessId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id, businessId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  create(businessId: string, input: CreateCampaignInput): Promise<Campaign> {
    return this.campaignRepo.save(
      this.campaignRepo.create({
        businessId,
        name: input.name,
        status: CampaignStatus.DRAFT,
        messageTemplate: input.messageTemplate,
        targetListIds: input.targetListIds ?? [],
        sessionIds: input.sessionIds ?? [],
        schedule: input.schedule ?? {},
      }),
    );
  }

  /**
   * Materialize recipients (deduped, opt-out-filtered) and move the campaign to RUNNING (or SCHEDULED
   * if a future startAt is set). Idempotent-ish: only allowed from DRAFT/SCHEDULED.
   */
  async start(businessId: string, id: string): Promise<Campaign> {
    const campaign = await this.get(businessId, id);
    if (![CampaignStatus.DRAFT, CampaignStatus.SCHEDULED].includes(campaign.status)) {
      throw new BadRequestException(`Cannot start a campaign in status '${campaign.status}'`);
    }
    if (!campaign.sessionIds.length) throw new BadRequestException('Campaign has no sending numbers');
    if (!campaign.targetListIds.length) throw new BadRequestException('Campaign has no target audience');
    if (!campaign.messageTemplate?.type) throw new BadRequestException('Campaign has no message');

    const contacts = await this.audience.resolveRecipients(businessId, campaign.targetListIds);
    if (contacts.length === 0) throw new BadRequestException('Audience resolved to 0 sendable contacts');

    // Insert recipient rows (skip any that already exist — unique on (campaignId, contactId)).
    const rows = contacts.map(c =>
      this.recipientRepo.create({
        campaignId: campaign.id,
        businessId,
        contactId: c.id,
        phone: c.phone,
        attributes: { name: c.name ?? '', ...c.attributes },
        status: RecipientStatus.PENDING,
      }),
    );
    // orIgnore avoids blowing up on a re-start; TypeORM insert with skip-on-conflict. The cast mirrors
    // the codebase pattern for json columns whose type widens under QueryDeepPartialEntity.
    await this.recipientRepo
      .createQueryBuilder()
      .insert()
      .values(rows as unknown as QueryDeepPartialEntity<CampaignRecipient>[])
      .orIgnore()
      .execute();

    const total = await this.recipientRepo.count({ where: { campaignId: campaign.id } });
    const startAt = campaign.schedule?.startAt ? new Date(campaign.schedule.startAt) : null;
    const scheduledForFuture = startAt && startAt.getTime() > Date.now();

    campaign.totalRecipients = total;
    campaign.status = scheduledForFuture ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING;
    if (!scheduledForFuture) campaign.startedAt = new Date();
    const saved = await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign ${scheduledForFuture ? 'scheduled' : 'started'}: ${campaign.name}`, {
      businessId,
      campaignId: campaign.id,
      recipients: total,
    });
    return saved;
  }

  async setStatus(businessId: string, id: string, status: CampaignStatus): Promise<Campaign> {
    const campaign = await this.get(businessId, id);
    campaign.status = status;
    return this.campaignRepo.save(campaign);
  }

  pause(businessId: string, id: string): Promise<Campaign> {
    return this.setStatus(businessId, id, CampaignStatus.PAUSED);
  }

  resume(businessId: string, id: string): Promise<Campaign> {
    return this.setStatus(businessId, id, CampaignStatus.RUNNING);
  }

  cancel(businessId: string, id: string): Promise<Campaign> {
    return this.setStatus(businessId, id, CampaignStatus.CANCELLED);
  }

  /** Recipient status breakdown for a campaign (for the progress view). */
  async stats(businessId: string, id: string): Promise<Record<string, number>> {
    await this.get(businessId, id);
    const rows = await this.recipientRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('r.campaignId = :id', { id })
      .groupBy('r.status')
      .getRawMany<{ status: string; count: string }>();
    return Object.fromEntries(rows.map(r => [r.status, Number(r.count)]));
  }

  /** Per-recipient rows for the campaign detail page (isolation-checked via get()). */
  async recipients(businessId: string, id: string, status?: string): Promise<CampaignRecipient[]> {
    await this.get(businessId, id);
    const where: Record<string, unknown> = { campaignId: id };
    if (status) where.status = status;
    return this.recipientRepo.find({ where, take: 2000, order: { sentAt: 'DESC' } });
  }
}
