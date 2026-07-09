import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// A named audience (a list of contacts) within a business. Campaigns target one or more lists.
@Index('IDX_contactlist_business', ['businessId'])
@Entity('contact_lists')
export class ContactList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  businessId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Denormalized member count for quick display; kept roughly in sync on import/add/remove. */
  @Column({ type: 'int', default: 0 })
  contactCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
