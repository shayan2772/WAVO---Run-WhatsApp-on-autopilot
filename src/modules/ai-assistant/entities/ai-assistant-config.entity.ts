import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from '../../session/entities/session.entity';

// One AI-assistant config per session. `enabled` is the per-tenant activation toggle:
// the assistant is a first-class, always-compiled feature that each session turns on/off.
@Index('IDX_ai_config_session', ['sessionId'], { unique: true })
@Entity('ai_assistant_configs')
export class AiAssistantConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // varchar (not uuid) to match sessions.id and the data connection's synchronize:false posture,
  // mirroring the Template entity's convention.
  @Column({ type: 'varchar' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  /** The activation toggle. Assistant only replies when this is true. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** OpenRouter model id. Null → fall back to the configured OPENROUTER_MODEL default. */
  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  /** Persona / instructions prepended to the system prompt. */
  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'float', default: 0.3 })
  temperature: number;

  @Column({ type: 'int', default: 500 })
  maxTokens: number;

  /** How many KB chunks to retrieve per query. */
  @Column({ type: 'int', default: 4 })
  topK: number;

  /**
   * Minimum cosine similarity a chunk must clear to be injected. Chunks below this are dropped, so an
   * off-topic question yields NO context and the assistant says it's not sure instead of hallucinating.
   * 0 disables the filter (always inject topK). ~0.3–0.4 is a sensible band for text-embedding-3-small.
   */
  @Column({ type: 'float', default: 0.35 })
  minScore: number;

  /**
   * How many recent conversation messages (user + assistant, per contact) to replay as context, so
   * follow-up questions carry prior turns. 0 = stateless / single-turn.
   */
  @Column({ type: 'int', default: 8 })
  historyLimit: number;

  /**
   * Rewrite a conversational follow-up into a standalone search query (using history) BEFORE KB
   * retrieval — resolves pronouns and strips filler so "Okay and where are you located?" retrieves as
   * "Where is the shop located?". Costs one extra small model call per follow-up.
   */
  @Column({ type: 'boolean', default: true })
  rewriteFollowups: boolean;

  /** How long a human takeover (or handoff keyword) pauses the AI before it auto-resumes, in minutes. */
  @Column({ type: 'int', default: 30 })
  snoozeMinutes: number;

  /** When false (default), group messages are ignored — 1:1 chats only. */
  @Column({ type: 'boolean', default: false })
  replyToGroups: boolean;

  /**
   * Comma-separated keywords that, if present in an inbound message, suppress the auto-reply
   * (hand the conversation to a human). Empty/null = never hand off automatically.
   */
  @Column({ type: 'text', nullable: true })
  handoffKeywords: string | null;

  /** Sent when the model errors or returns nothing. Null = stay silent on failure. */
  @Column({ type: 'text', nullable: true })
  fallbackMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
