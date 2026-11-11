import { MessagingError } from '../../domain/messaging.js';
import type { Chat, Message, MessageSent, Page, PageQuery } from '../../domain/messaging.js';
import type { ChatRepository } from '../../application/ports/out/chat-repository.js';
import type { MessageRepository } from '../../application/ports/out/message-repository.js';

function pageOf<T>(items: T[], page: PageQuery): Page<T> {
  const start = (page.page - 1) * page.pageSize;
  return { ...page, totalRecords: items.length, items: structuredClone(items.slice(start, start + page.pageSize)) };
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function conflict(): never { throw new MessagingError('CHAT_CONFLICT', 'Duplicate resource ID'); }

export class InMemoryChatRepository implements ChatRepository {
  private readonly chats = new Map<string, Chat>();
  private readonly conversations = new Map<string, string>();

  async findById(id: string): Promise<Chat | undefined> {
    const chat = this.chats.get(id);
    return chat === undefined ? undefined : structuredClone(chat);
  }

  async getOrCreate(chat: Chat): Promise<Chat> {
    // Tuple encoding avoids collisions when opaque IDs contain separators.
    const key = JSON.stringify([chat.publicationId, chat.buyerId]);
    const existingId = this.conversations.get(key);
    if (existingId !== undefined) return structuredClone(this.chats.get(existingId)!);
    if (this.chats.has(chat.id)) conflict();
    const copy = structuredClone(chat);
    // No await between uniqueness check and insertion: atomic within this fake.
    this.chats.set(copy.id, copy);
    this.conversations.set(key, copy.id);
    return structuredClone(copy);
  }

  async listForParticipant(userId: string, page: PageQuery): Promise<Page<Chat>> {
    const items = [...this.chats.values()].filter(chat => chat.buyerId === userId || chat.sellerId === userId);
    items.sort((a, b) => b.createdAt - a.createdAt || compare(a.id, b.id));
    return pageOf(items, page);
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly messages = new Map<string, Message>();
  private readonly events = new Map<string, MessageSent>();

  async append(message: Message, event: MessageSent): Promise<void> {
    if (this.messages.has(message.id) || this.events.has(event.eventId)) conflict();
    if (event.messageId !== message.id || event.chatId !== message.chatId ||
        event.senderUserId !== message.senderUserId || event.recipientUserId !== message.recipientUserId ||
        event.sentAt !== message.sentAt) {
      throw new MessagingError('INVALID_MESSAGE', 'Event does not match message');
    }
    const messageCopy = structuredClone(message);
    const eventCopy = structuredClone(event);
    this.messages.set(messageCopy.id, messageCopy);
    this.events.set(eventCopy.eventId, eventCopy);
  }

  async listByChat(chatId: string, page: PageQuery): Promise<Page<Message>> {
    const items = [...this.messages.values()].filter(message => message.chatId === chatId);
    items.sort((a, b) => a.sentAt - b.sentAt || compare(a.id, b.id));
    return pageOf(items, page);
  }

  // Test inspection only; no dispatch, acknowledgement or durable delivery guarantee.
  preparedEvents(): MessageSent[] { return structuredClone([...this.events.values()]); }
}
