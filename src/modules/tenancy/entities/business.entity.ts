import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// A tenant. Owns WhatsApp sessions (via Session.businessId), the shared knowledge base, audiences,
// campaigns, and API keys. Every request resolves to exactly one active business.
@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  /** The user who created the business (owner). Indexed logical ref to users.id. */
  @Index('IDX_businesses_owner')
  @Column({ type: 'varchar' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  slug: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
