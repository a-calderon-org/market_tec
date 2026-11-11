import type { Message, MessageSent, Page, PageQuery } from '../../../domain/messaging.js';

export interface MessageRepository {
  // Prepare the event with the message as one operation, or persist neither.
  // This is a local behavioral requirement, not an approved Cosmos/outbox design.
  append(message: Message, event: MessageSent): Promise<void>;
  listByChat(chatId: string, page: PageQuery): Promise<Page<Message>>;
}
