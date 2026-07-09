import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// Join row: a contact's membership in a list. Removing a membership never deletes the Contact, so a
// global opt-out on the Contact persists across list changes.
@Index('IDX_listmember_unique', ['listId', 'contactId'], { unique: true })
@Index('IDX_listmember_list', ['listId'])
@Index('IDX_listmember_contact', ['contactId'])
@Entity('contact_list_memberships')
export class ContactListMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  listId: string;

  @Column({ type: 'varchar' })
  contactId: string;

  @CreateDateColumn()
  createdAt: Date;
}
