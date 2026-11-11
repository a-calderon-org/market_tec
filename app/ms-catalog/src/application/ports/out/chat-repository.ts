import type { Chat, Page, PageQuery } from '../../../domain/messaging.js';

export interface ChatRepository {
  findById(id: string): Promise<Chat | undefined>;
  // Atomic uniqueness by (publicationId, buyerId). Return the existing chat on retry.
  // A generated ID colliding with a different chat must fail without overwriting it.
  getOrCreate(chat: Chat): Promise<Chat>;
  listForParticipant(userId: string, page: PageQuery): Promise<Page<Chat>>;
}
