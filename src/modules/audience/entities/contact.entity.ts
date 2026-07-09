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

// A marketing contact, owned by a business. Deduped by (businessId, phone): one row no matter how
// many lists it belongs to, so an opt-out is honored globally for the business.
@Index('IDX_contact_business_phone', ['businessId', 'phone'], { unique: true })
@Index('IDX_contact_business', ['businessId'])
@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  businessId: string;

  /** Normalized E.164 digits (no '+'), the dedup + send key. */
  @Column({ type: 'varchar', length: 32 })
  phone: string;

  /** Resolved WhatsApp JID once known (e.g. <phone>@c.us). */
  @Column({ type: 'varchar', nullable: true })
  jid: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  /** Merge-field source for personalization ({{firstName}}, {{company}}, …). */
  @Column({ type: jsonColumnType(), default: '{}' })
  attributes: Record<string, unknown>;

  /** Free-form tags for segmentation. */
  @Column({ type: jsonColumnType(), default: '[]' })
  tags: string[];

  /** Global opt-out for the business — excluded from ALL future campaigns. */
  @Column({ type: 'boolean', default: false })
  optedOut: boolean;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  optedOutAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  optOutReason: string | null;

  /** How this contact entered: 'import' | 'manual' | 'inbound'. */
  @Column({ type: 'varchar', length: 20, default: 'import' })
  source: string;

  /** Last time this contact messaged us (improves the reply-ratio anti-ban signal). */
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastInboundAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastCampaignAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
