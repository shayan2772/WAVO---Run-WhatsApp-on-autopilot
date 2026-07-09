import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';

// One embedded chunk of a KnowledgeDocument. The embedding is stored as a JSON-encoded
// number[] (portable across SQLite and Postgres). Retrieval is a brute-force cosine scan
// over a session's chunks — fine for the per-tenant KB sizes this MVP targets. For large
// KBs, swap this column for pgvector + an ANN index (Supabase) without touching callers.
@Index('IDX_ai_kchunk_business', ['businessId'])
@Index('IDX_ai_kchunk_session', ['sessionId'])
@Index('IDX_ai_kchunk_document', ['documentId'])
@Entity('ai_knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Denormalized owner business for the per-business retrieval scan. Nullable during rollout. */
  @Column({ type: 'varchar', nullable: true })
  businessId: string | null;

  /** Provenance: which session uploaded this. Retrieval keys on businessId, not this. */
  @Column({ type: 'varchar' })
  sessionId: string;

  @Column({ type: 'varchar' })
  documentId: string;

  @ManyToOne(() => KnowledgeDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: KnowledgeDocument;

  @Column({ type: 'text' })
  content: string;

  /** JSON-encoded embedding vector (number[]). */
  @Column({ type: 'text' })
  embedding: string;
}
