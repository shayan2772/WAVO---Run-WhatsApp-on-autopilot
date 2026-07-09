import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

// Links a user to a business with a role. A user may belong to several businesses; membership is the
// authority the UnifiedAuthGuard re-checks live on every JWT request (never trust the token's `bid`
// claim alone — a removed member must lose access before the token expires).
@Index('IDX_membership_user_business', ['userId', 'businessId'], { unique: true })
@Entity('business_memberships')
export class BusinessMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_membership_user')
  @Column({ type: 'varchar' })
  userId: string;

  @Index('IDX_membership_business')
  @Column({ type: 'varchar' })
  businessId: string;

  @Column({ type: 'varchar', length: 20, default: MembershipRole.OWNER })
  role: MembershipRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
