import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum SessionStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  QR_READY = 'qr_ready',
  AUTHENTICATING = 'authenticating',
  READY = 'ready',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

@Entity('sessions')
// Session names are unique PER BUSINESS, not globally: two tenants may each have a "customer-support"
// number. (businessId, name) composite unique index. NULL businessId rows (legacy/unowned) are treated
// as distinct by SQL NULL semantics, which is fine — those predate multi-tenancy.
@Index('UQ_sessions_business_name', ['businessId', 'name'], { unique: true })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Tenancy anchor: the business that owns this WhatsApp number. Nullable during the rollout
  // (backfilled to the Default Workspace on upgrade), then treated as required by app logic.
  @Index('IDX_sessions_business')
  @Column({ type: 'varchar', nullable: true })
  businessId: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: SessionStatus.CREATED,
  })
  status: SessionStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pushName: string | null;

  @Column({ type: jsonColumnType(), default: '{}' })
  config: Record<string, unknown>;

  // Phase 3: Proxy per session
  @Column({ type: 'varchar', length: 255, nullable: true })
  proxyUrl: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  proxyType: 'http' | 'https' | 'socks4' | 'socks5' | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  connectedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastActiveAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Transient (non-persisted) human-readable reason for the most recent terminal
   * engine failure. Populated at read time from the in-memory error map so the
   * dashboard can explain a FAILED status; intentionally not a column because it
   * is runtime state that resets when the engine re-initializes.
   */
  lastError?: string;
}
