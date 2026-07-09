import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum HealthState {
  HEALTHY = 'healthy',
  THROTTLED = 'throttled',
  PAUSED = 'paused',
}

// Per-number (per-session) sending health + warm-up state. The pacer reads this to decide how much a
// number may send today and how long to wait between messages.
@Index('IDX_numberhealth_session', ['sessionId'], { unique: true })
@Entity('number_health')
export class NumberHealth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  sessionId: string;

  /** When the number first reached READY — drives the warm-up age/tier. */
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  firstReadyAt: Date | null;

  /** Messages sent in the current UTC day; reset lazily when `dayKey` rolls over. */
  @Column({ type: 'int', default: 0 })
  sentToday: number;

  /** YYYY-MM-DD (UTC) the counter belongs to. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  dayKey: string | null;

  @Column({ type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'varchar', length: 20, default: HealthState.HEALTHY })
  healthState: HealthState;

  /** Epoch ms of the last send — the pacer gates the inter-message delay against this. */
  @Column({ type: 'bigint', nullable: true })
  lastSentAtMs: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
