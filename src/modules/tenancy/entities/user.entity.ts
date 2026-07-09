import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// A person who signs in to the SaaS. Lives on the 'data' connection alongside Business/Session so
// the tenancy graph has real referential locality (SQLite runs with FKs off, prod uses migrations,
// so cross-refs are indexed varchars — consistent with the app's pervasive sessionId provenance).
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored lowercased; unique across the whole SaaS. */
  @Index('IDX_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** The business the user is currently acting in (drives the JWT `bid` claim). */
  @Column({ type: 'varchar', nullable: true })
  activeBusinessId: string | null;

  /** Bumped on logout / "log out everywhere"; access tokens carrying an older `tv` are rejected. */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
