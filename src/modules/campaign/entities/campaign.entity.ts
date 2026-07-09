import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

/** The message to send; text/caption support {{merge}} fields rendered per-recipient at send time. */
export interface CampaignMessageTemplate {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  mediaUrl?: string; // remote URL (optional alternative to an uploaded file)
  mediaBase64?: string; // uploaded-file bytes (base64, no data: prefix) — one copy per campaign
  mediaMimetype?: string; // required when using mediaBase64
  caption?: string;
  filename?: string;
}

/** Optional pacing/scheduling overrides layered on top of per-number warm-up defaults. */
export interface CampaignSchedule {
  startAt?: string; // ISO; SCHEDULED campaigns wait until this
  timezone?: string; // IANA, for the send window (default UTC)
  windowStartHour?: number; // 0-23 local; sends only within [start,end)
  windowEndHour?: number;
  interMessageDelayMinMs?: number; // overrides warm-up tier defaults if set
  interMessageDelayMaxMs?: number;
  dailyCapPerNumber?: number; // overrides warm-up tier cap if set (still clamped by tier max)
}

@Index('IDX_campaign_business', ['businessId'])
@Index('IDX_campaign_status', ['status'])
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  @Column({ type: jsonColumnType() })
  messageTemplate: CampaignMessageTemplate;

  /** Target audience list ids (recipients are the deduped, opt-out-filtered union). */
  @Column({ type: jsonColumnType(), default: '[]' })
  targetListIds: string[];

  /** The sending pool — one or more WhatsApp session ids to spread the load across. */
  @Column({ type: jsonColumnType(), default: '[]' })
  sessionIds: string[];

  @Column({ type: jsonColumnType(), default: '{}' })
  schedule: CampaignSchedule;

  // Progress counters (denormalized; recipient rows are the source of truth).
  @Column({ type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ type: 'int', default: 0 })
  sentCount: number;

  @Column({ type: 'int', default: 0 })
  failedCount: number;

  @Column({ type: 'int', default: 0 })
  skippedCount: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
