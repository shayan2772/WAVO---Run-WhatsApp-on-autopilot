import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum RecipientStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

// One durable row per recipient — the send cursor (replaces an in-memory loop). Scales to millions
// and makes each recipient individually resumable after a restart.
@Index('IDX_recipient_campaign', ['campaignId'])
@Index('IDX_recipient_campaign_status', ['campaignId', 'status'])
@Index('IDX_recipient_unique', ['campaignId', 'contactId'], { unique: true })
@Entity('campaign_recipients')
export class CampaignRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  campaignId: string;

  @Column({ type: 'varchar' })
  businessId: string;

  @Column({ type: 'varchar' })
  contactId: string;

  /** Snapshot of the recipient's phone + merge attributes at materialization time. */
  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: jsonColumnType(), default: '{}' })
  attributes: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: RecipientStatus.PENDING })
  status: RecipientStatus;

  /** Which session actually sent it (assigned at send time from the healthy pool). */
  @Column({ type: 'varchar', nullable: true })
  assignedSessionId: string | null;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @Column({ type: 'varchar', nullable: true })
  waMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
