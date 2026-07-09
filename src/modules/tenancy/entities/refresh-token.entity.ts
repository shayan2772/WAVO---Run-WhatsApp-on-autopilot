import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// A hashed, rotating refresh token. The raw token lives only in the client's httpOnly cookie; we store
// the SHA-256 hash. On use it is deleted and replaced (rotation); logout deletes the user's tokens.
@Index('IDX_refresh_user', ['userId'])
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Index('IDX_refresh_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar' })
  expiresAt: string; // ISO string; compared lexically/temporally in code

  @CreateDateColumn()
  createdAt: Date;
}
