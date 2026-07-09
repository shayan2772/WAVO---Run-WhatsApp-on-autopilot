import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { OpenRouterService } from './openrouter.service';

/** Max characters per chunk before we split. Small KBs stay as 1–2 chunks. */
const CHUNK_SIZE = 900;
/** Character overlap carried between adjacent chunks so a fact split across a boundary isn't lost. */
const CHUNK_OVERLAP = 150;

export interface RetrievedChunk {
  content: string;
  score: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = createLogger('KnowledgeService');

  constructor(
    @InjectRepository(KnowledgeDocument, 'data')
    private readonly docRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk, 'data')
    private readonly chunkRepo: Repository<KnowledgeChunk>,
    private readonly openRouter: OpenRouterService,
  ) {}

  listDocuments(businessId: string): Promise<KnowledgeDocument[]> {
    return this.docRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  /** Add a document to a business's shared KB: persist it, split into chunks, embed, store vectors. */
  async addDocument(
    businessId: string,
    sessionId: string,
    title: string,
    content: string,
  ): Promise<KnowledgeDocument> {
    const chunks = this.splitIntoChunks(content);
    const embeddings = await this.openRouter.embed(chunks);

    const doc = await this.docRepo.save(
      this.docRepo.create({ businessId, sessionId, title, content, chunkCount: chunks.length }),
    );

    const chunkRows = chunks.map((text, i) =>
      this.chunkRepo.create({
        businessId,
        sessionId,
        documentId: doc.id,
        content: text,
        embedding: JSON.stringify(embeddings[i]),
      }),
    );
    await this.chunkRepo.save(chunkRows);

    this.logger.log(`KB document added (${chunks.length} chunks)`, { businessId, documentId: doc.id });
    return doc;
  }

  async deleteDocument(businessId: string, documentId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: documentId, businessId } });
    if (!doc) throw new NotFoundException('Knowledge document not found');
    await this.chunkRepo.delete({ documentId });
    await this.docRepo.delete({ id: documentId });
  }

  /**
   * Retrieve the top-K most relevant chunks for a query via brute-force cosine similarity over the
   * BUSINESS's stored embeddings, keeping only those at or above `minScore`. Returns [] when the KB is
   * empty OR nothing clears the threshold — the caller then tells the model there's no match, so an
   * off-topic question produces an honest "I'm not sure" instead of a hallucination.
   */
  async retrieve(businessId: string, query: string, k = 4, minScore = 0.35): Promise<RetrievedChunk[]> {
    const chunks = await this.chunkRepo.find({ where: { businessId } });
    if (chunks.length === 0) return [];

    const [queryVec] = await this.openRouter.embed([query]);
    return chunks
      .map(c => ({ content: c.content, score: cosine(queryVec, safeParseVec(c.embedding)) }))
      .filter(s => Number.isFinite(s.score) && s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  private splitIntoChunks(content: string): string[] {
    const normalized = content.trim();
    if (normalized.length <= CHUNK_SIZE) return normalized ? [normalized] : [];

    // Split on paragraph boundaries first, then greedily pack up to CHUNK_SIZE.
    const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = '';
    for (const para of paragraphs) {
      if (para.length > CHUNK_SIZE) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        // Hard-split an oversized paragraph with overlap so a sentence spanning the cut survives.
        const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);
        for (let i = 0; i < para.length; i += step) {
          chunks.push(para.slice(i, i + CHUNK_SIZE));
          if (i + CHUNK_SIZE >= para.length) break;
        }
        continue;
      }
      if ((current + '\n\n' + para).length > CHUNK_SIZE) {
        chunks.push(current);
        current = para;
      } else {
        current = current ? `${current}\n\n${para}` : para;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}

function safeParseVec(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as number[]) : [];
  } catch {
    return [];
  }
}

function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return NaN;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return NaN;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
