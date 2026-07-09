import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { MessageService } from '../message/message.service';
import { EventsGateway } from '../events/events.gateway';
import { AiAssistantConfig } from './entities/ai-assistant-config.entity';
import { ConversationTurn } from './entities/conversation-turn.entity';
import { ContactAiState } from './entities/contact-ai-state.entity';
import { Session } from '../session/entities/session.entity';
import { KnowledgeService, RetrievedChunk } from './knowledge.service';
import { OpenRouterService, ChatMessage } from './openrouter.service';
import { UpdateAiConfigDto } from './dto/ai-assistant.dto';

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful WhatsApp assistant replying on behalf of a business. ' +
  'Answer only from the provided knowledge base and the conversation. ' +
  'If the answer is not in the knowledge base, say you are not sure and offer to connect a human. ' +
  'Keep replies short, friendly, and suitable for a WhatsApp chat.';

// Minimum gap between auto-replies to the same chat — a light loop/flood guard.
const REPLY_COOLDOWN_MS = 3000;

const CONDENSE_SYSTEM =
  "Rewrite the user's latest message into a single standalone search query for a knowledge base. " +
  "Resolve pronouns and references ('it', 'they', 'you', 'that', 'the address') using the conversation, " +
  "and drop conversational filler ('okay', 'and', 'thanks', 'so'). If the message is already a standalone " +
  'question, return it unchanged. Output ONLY the rewritten query — no quotes, no explanation.';

@Injectable()
export class AiAssistantService {
  private readonly logger = createLogger('AiAssistantService');
  private readonly lastReplyAt = new Map<string, number>();
  private messageService?: MessageService;
  private eventsGateway?: EventsGateway;

  constructor(
    @InjectRepository(AiAssistantConfig, 'data')
    private readonly configRepo: Repository<AiAssistantConfig>,
    @InjectRepository(ConversationTurn, 'data')
    private readonly turnRepo: Repository<ConversationTurn>,
    @InjectRepository(ContactAiState, 'data')
    private readonly stateRepo: Repository<ContactAiState>,
    @InjectRepository(Session, 'data')
    private readonly sessionRepo: Repository<Session>,
    private readonly knowledge: KnowledgeService,
    private readonly openRouter: OpenRouterService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // The KB is per-business; resolve the owning business from the session (cached). Server-side path
  // (handleIncoming) has no request context, so we look it up. Returns null for a legacy/unowned session.
  private readonly businessIdCache = new Map<string, string | null>();
  private async resolveBusinessId(sessionId: string): Promise<string | null> {
    if (this.businessIdCache.has(sessionId)) return this.businessIdCache.get(sessionId)!;
    const session = await this.sessionRepo.findOne({ where: { id: sessionId }, select: ['id', 'businessId'] });
    const businessId = session?.businessId ?? null;
    this.businessIdCache.set(sessionId, businessId);
    return businessId;
  }

  // Resolve MessageService lazily (avoids a module-graph cycle). Cached after first lookup.
  private getMessageService(): MessageService {
    if (!this.messageService) {
      this.messageService = this.moduleRef.get(MessageService, { strict: false });
    }
    return this.messageService;
  }

  // Resolve EventsGateway lazily (app-wide singleton). Used to push a live "human needed" alert to
  // the dashboard the instant a chat is handed off. Best-effort — never blocks the message path.
  private getEventsGateway(): EventsGateway | undefined {
    if (!this.eventsGateway) {
      try {
        this.eventsGateway = this.moduleRef.get(EventsGateway, { strict: false });
      } catch {
        return undefined;
      }
    }
    return this.eventsGateway;
  }

  /** Notify the dashboard that a chat needs a human (ringtone + desktop notification). */
  private notifyHandoff(sessionId: string, chatId: string, reason: string, snoozedUntil: Date | null, preview?: string) {
    try {
      this.getEventsGateway()?.emitAiHandoff(sessionId, {
        chatId,
        reason,
        snoozedUntil: snoozedUntil ? snoozedUntil.toISOString() : null,
        contactName: chatId.split('@')[0] || chatId,
        preview: preview?.slice(0, 120),
      });
    } catch (err) {
      this.logger.warn?.('Handoff notify failed', String(err));
    }
  }

  // ---- Config management -------------------------------------------------

  async getConfig(sessionId: string): Promise<AiAssistantConfig> {
    const existing = await this.configRepo.findOne({ where: { sessionId } });
    if (existing) return existing;
    // Return an unsaved default so the dashboard can render before the user saves anything.
    return this.configRepo.create({
      sessionId,
      enabled: false,
      model: null,
      systemPrompt: null,
      temperature: 0.3,
      maxTokens: 500,
      topK: 4,
      minScore: 0.35,
      historyLimit: 8,
      rewriteFollowups: true,
      snoozeMinutes: 30,
      replyToGroups: false,
      handoffKeywords: null,
      fallbackMessage: null,
    });
  }

  async updateConfig(sessionId: string, dto: UpdateAiConfigDto): Promise<AiAssistantConfig> {
    const config = await this.ensureConfig(sessionId);
    Object.assign(config, dto);
    return this.configRepo.save(config);
  }

  async setEnabled(sessionId: string, enabled: boolean): Promise<AiAssistantConfig> {
    const config = await this.ensureConfig(sessionId);
    config.enabled = enabled;
    return this.configRepo.save(config);
  }

  private async ensureConfig(sessionId: string): Promise<AiAssistantConfig> {
    const existing = await this.configRepo.findOne({ where: { sessionId } });
    if (existing) return existing;
    return this.configRepo.save(this.configRepo.create({ sessionId }));
  }

  // ---- Human takeover / snooze -------------------------------------------

  /** Pause the AI for a chat (human takeover). Auto-resumes after `minutes` (defaults to config). */
  async snooze(sessionId: string, chatId: string, minutes?: number, by?: string): Promise<ContactAiState> {
    const config = await this.getConfig(sessionId);
    const mins = minutes ?? config.snoozeMinutes ?? 30;
    const snoozedUntil = new Date(Date.now() + mins * 60 * 1000);
    let state = await this.stateRepo.findOne({ where: { sessionId, chatId } });
    if (!state) state = this.stateRepo.create({ sessionId, chatId });
    state.snoozedUntil = snoozedUntil;
    state.snoozedBy = by ?? null;
    return this.stateRepo.save(state);
  }

  /** Hand the chat back to the AI immediately. */
  async unsnooze(sessionId: string, chatId: string): Promise<void> {
    await this.stateRepo.update({ sessionId, chatId }, { snoozedUntil: null, snoozedBy: null });
  }

  /** True if the AI is currently paused for this chat. */
  async isSnoozed(sessionId: string, chatId: string): Promise<boolean> {
    const state = await this.stateRepo.findOne({ where: { sessionId, chatId }, select: ['snoozedUntil'] });
    return !!state?.snoozedUntil && new Date(state.snoozedUntil).getTime() > Date.now();
  }

  /** Snooze/takeover state for a chat (for the inbox UI). */
  getChatState(sessionId: string, chatId: string): Promise<ContactAiState | null> {
    return this.stateRepo.findOne({ where: { sessionId, chatId } });
  }

  // ---- Test playground (no WhatsApp send) --------------------------------

  async test(
    sessionId: string,
    text: string,
  ): Promise<{ reply: string; retrieved: Array<{ score: number; preview: string }> }> {
    const config = await this.getConfig(sessionId);
    const businessId = await this.resolveBusinessId(sessionId);
    const context = businessId
      ? await this.knowledge.retrieve(businessId, text, config.topK, config.minScore)
      : [];
    const reply = await this.generate(config, text, context);
    // Surface scores + previews so you can judge retrieval quality (see the RAG eval rubric).
    return {
      reply,
      retrieved: context.map(c => ({ score: Number(c.score.toFixed(3)), preview: c.content.slice(0, 80) })),
    };
  }

  // ---- Runtime: called from SessionService.onMessage (fire-and-forget) ----

  async handleIncoming(sessionId: string, message: IncomingMessage): Promise<void> {
    if (!this.openRouter.isConfigured()) return; // no key → feature dormant
    if (message.fromMe || message.isStatusBroadcast) return;

    const config = await this.configRepo.findOne({ where: { sessionId } });
    if (!config || !config.enabled) return;

    if (message.isGroup && !config.replyToGroups) return;

    // Human takeover: if the chat is snoozed, stay silent until it auto-resumes.
    if (await this.isSnoozed(sessionId, message.chatId)) return;

    const text = (message.body || '').trim();
    if (!text) return; // text-only assistant for now (media ignored)

    if (this.matchesHandoff(text, config.handoffKeywords)) {
      this.logger.log('Handoff keyword hit — snoozing AI for a human', { sessionId, chatId: message.chatId });
      const state = await this.snooze(sessionId, message.chatId, config.snoozeMinutes, 'keyword');
      this.notifyHandoff(sessionId, message.chatId, 'keyword', state.snoozedUntil ?? null, text);
      return;
    }

    // Per-chat cooldown so a burst of messages doesn't fan out into a burst of model calls.
    const cooldownKey = `${sessionId}:${message.chatId}`;
    const now = Date.now();
    const last = this.lastReplyAt.get(cooldownKey) ?? 0;
    if (now - last < REPLY_COOLDOWN_MS) return;
    this.lastReplyAt.set(cooldownKey, now);

    try {
      const history = await this.loadHistory(sessionId, message.chatId, config.historyLimit);
      // Rewrite a conversational follow-up into a standalone query so retrieval isn't degraded by
      // filler/pronouns; generation still uses the original message + full history.
      const retrievalQuery = await this.condenseQuery(config, text, history);
      const businessId = await this.resolveBusinessId(sessionId);
      const context = businessId
        ? await this.knowledge.retrieve(businessId, retrievalQuery, config.topK, config.minScore)
        : [];
      const reply = await this.generate(config, text, context, history);
      await this.getMessageService().sendText(sessionId, { chatId: message.chatId, text: reply });
      await this.saveTurns(sessionId, message.chatId, text, reply);
      this.logger.log('AI auto-reply sent', {
        sessionId,
        chatId: message.chatId,
        contextChunks: context.length,
        historyTurns: history.length,
        rewritten: retrievalQuery !== text ? retrievalQuery : undefined,
      });
    } catch (err) {
      this.logger.error(`AI auto-reply failed for ${sessionId}`, String(err));
      if (config.fallbackMessage) {
        await this.getMessageService()
          .sendText(sessionId, { chatId: message.chatId, text: config.fallbackMessage })
          .catch(e => this.logger.error('Fallback send failed', String(e)));
      }
    }
  }

  // ---- Generation --------------------------------------------------------

  private async generate(
    config: AiAssistantConfig,
    userText: string,
    context: RetrievedChunk[],
    history: ChatMessage[] = [],
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(config, context) },
      ...history,
      { role: 'user', content: userText },
    ];
    return this.openRouter.chat(messages, {
      model: config.model || this.openRouter.defaultModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }

  /**
   * Turn a conversational follow-up into a standalone retrieval query using the history. No-op when
   * disabled or there's no history. Falls back to the raw text on any error (retrieval still runs).
   */
  private async condenseQuery(config: AiAssistantConfig, text: string, history: ChatMessage[]): Promise<string> {
    if (!config.rewriteFollowups || history.length === 0) return text;
    try {
      const historyText = history.map(h => `${h.role}: ${h.content}`).join('\n');
      const rewritten = await this.openRouter.chat(
        [
          { role: 'system', content: CONDENSE_SYSTEM },
          {
            role: 'user',
            content: `Conversation so far:\n${historyText}\n\nLatest message: "${text}"\n\nStandalone search query:`,
          },
        ],
        { model: config.model || this.openRouter.defaultModel, temperature: 0, maxTokens: 60 },
      );
      const q = rewritten.trim().replace(/^["']+|["']+$/g, '');
      return q || text;
    } catch (err) {
      this.logger.warn(`Query rewrite failed, using raw text: ${String(err)}`);
      return text;
    }
  }

  /** Load the last N conversation messages for a contact, oldest→newest, as chat messages. */
  private async loadHistory(sessionId: string, chatId: string, limit: number): Promise<ChatMessage[]> {
    if (!limit || limit <= 0) return [];
    // DESC by time, then role ASC ('assistant' < 'user') to keep the assistant-after-user order within
    // a same-second exchange; take the newest N, then reverse to oldest→newest for the prompt.
    const rows = await this.turnRepo.find({
      where: { sessionId, chatId },
      order: { createdAt: 'DESC', role: 'ASC' },
      take: limit,
    });
    return rows.reverse().map(r => ({ role: r.role, content: r.content }));
  }

  private async saveTurns(sessionId: string, chatId: string, userText: string, assistantText: string): Promise<void> {
    await this.turnRepo.save([
      this.turnRepo.create({ sessionId, chatId, role: 'user', content: userText }),
      this.turnRepo.create({ sessionId, chatId, role: 'assistant', content: assistantText }),
    ]);
  }

  private buildSystemPrompt(config: AiAssistantConfig, context: RetrievedChunk[]): string {
    const persona = (config.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
    const grounding =
      'Answer ONLY using the knowledge base below. If it does not contain the answer, do not guess — ' +
      "say you're not sure and offer to connect a human.";
    if (context.length === 0) {
      return `${persona}\n\n${grounding}\n\n--- KNOWLEDGE BASE ---\n(No entries matched this question.)\n--- END KNOWLEDGE BASE ---`;
    }
    const kb = context.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    return `${persona}\n\n${grounding}\n\n--- KNOWLEDGE BASE ---\n${kb}\n--- END KNOWLEDGE BASE ---`;
  }

  private matchesHandoff(text: string, keywords: string | null): boolean {
    if (!keywords) return false;
    const lower = text.toLowerCase();
    return keywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
      .some(k => lower.includes(k));
  }
}
