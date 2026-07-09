import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from '../../session/entities/session.entity';

// A raw knowledge-base item the user adds to a session (pasted text, an FAQ, etc.).
// On insert it is chunked + embedded into KnowledgeChunk rows for retrieval.
@Index('IDX_ai_kdoc_business', ['businessId'])
@Index('IDX_ai_kdoc_session', ['sessionId'])
@Entity('ai_knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The knowledge base is per-BUSINESS (shared across all the business's numbers). Nullable during
  // rollout (backfilled), then treated as required. `sessionId` is kept as provenance (which number
  // uploaded it) but is no longer the retrieval key.
  @Column({ type: 'varchar', nullable: true })
  businessId: string | null;

  @Column({ type: 'varchar' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
