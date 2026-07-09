import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// One message in an assistant conversation, per (session, contact/chat). Recent turns are replayed
// to the model so follow-ups ("…and where are you located?") carry prior context. Kept deliberately
// lightweight: a flat append-only log; retrieval is "last N by time" for a chat.
@Index('IDX_ai_turn_session_chat', ['sessionId', 'chatId', 'createdAt'])
@Entity('ai_conversation_turns')
export class ConversationTurn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  sessionId: string;

  /** The chat/contact this turn belongs to (neutral JID, e.g. <phone>@c.us or <lid>@lid). */
  @Column({ type: 'varchar' })
  chatId: string;

  @Column({ type: 'varchar', length: 16 })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
