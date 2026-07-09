import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

// Per-contact AI state for a session: lets a human agent "take over" a chat, pausing the AI until a
// deadline, after which the AI automatically resumes (pure timestamp comparison — no background job).
@Index('IDX_contact_ai_state', ['sessionId', 'chatId'], { unique: true })
@Entity('contact_ai_states')
export class ContactAiState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  sessionId: string;

  /** Neutral chat/contact JID (e.g. <phone>@c.us). */
  @Column({ type: 'varchar' })
  chatId: string;

  /** AI is paused while now < snoozedUntil. Null/past = AI active. */
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  snoozedUntil: Date | null;

  /** Who initiated the takeover (userId or 'keyword'); informational. */
  @Column({ type: 'varchar', nullable: true })
  snoozedBy: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
