import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ChatRepository } from '../../../application/ports/out/chat-repository.js';
import type { MessageRepository } from '../../../application/ports/out/message-repository.js';
import { MessagingError } from '../../../domain/messaging.js';
import type { Chat, Message, MessageSent, Page, PageQuery } from '../../../domain/messaging.js';
import { chatDocument, document, eventDocument, messageDocument, physicalId, readChat, readMessage } from './documents.js';
import { commitUnknown, CosmosPersistenceError, deadline, hasStatus } from './store.js';
import type { CosmosStore, StoredDocument } from './store.js';

function conflict(): never {
  throw new MessagingError('CHAT_CONFLICT', 'Duplicate resource ID');
}

function sameDocument(value: unknown, expected: StoredDocument): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Object.entries(expected).every(([key, item]) => isDeepStrictEqual(row[key], item));
}

export class CosmosChatRepository implements ChatRepository {
  constructor(private readonly store: CosmosStore) {}

  async findById(id: string): Promise<Chat | undefined> {
    return this.read(id, deadline());
  }

  private async read(id: string, signal: AbortSignal): Promise<Chat | undefined> {
    const row = await this.store.read(physicalId('chat', id), signal);
    return row && readChat(row.document, this.store.partitionKey);
  }

  private async readPair(chat: Chat, pairId: string, signal: AbortSignal): Promise<Chat | undefined> {
    const row = await this.store.read(pairId, signal);
    if (!row) return undefined;
    const pair = document(row.document, 'pair', this.store.partitionKey);
    if (pair.id !== pairId || pair.publicationId !== chat.publicationId || pair.buyerId !== chat.buyerId) conflict();
    if (typeof pair.chatId !== 'string') throw new CosmosPersistenceError('read');
    const existing = await this.read(pair.chatId, signal);
    if (!existing || existing.id !== pair.chatId || existing.publicationId !== chat.publicationId ||
        existing.buyerId !== chat.buyerId) throw new CosmosPersistenceError('read');
    return existing;
  }

  async getOrCreate(chat: Chat): Promise<Chat> {
    const pk = this.store.partitionKey;
    const pairId = 'pair:' + createHash('sha256').update(JSON.stringify([chat.publicationId, chat.buyerId])).digest('hex');
    const pair = { id: pairId, pk, kind: 'pair', schemaVersion: 1 as const,
      publicationId: chat.publicationId, buyerId: chat.buyerId, chatId: chat.id };
    const signal = deadline();
    const row = chatDocument(chat, pk);
    const result = readChat(row, pk);
    try {
      await this.store.batchCreate([pair, row], signal);
      return result;
    } catch (error) {
      if (hasStatus(error, 409)) {
        const existing = await this.readPair(chat, pairId, signal);
        if (existing) return existing;
        conflict();
      }
      if (commitUnknown(error) && !signal.aborted) {
        // Reconcile by pair without retrying an ambiguous write.
        const existing = await this.readPair(chat, pairId, signal).catch(() => undefined);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async listForParticipant(userId: string, page: PageQuery): Promise<Page<Chat>> {
    const { items, totalRecords } = await this.store.page(
      "c.kind = 'chat' AND (c.buyerId = @user OR c.sellerId = @user)", [{ name: '@user', value: userId }],
      'c.createdAt DESC, c.sortId ASC', page.page, page.pageSize, deadline());
    const chats = items.map(item => readChat(item, this.store.partitionKey));
    if (chats.some(chat => chat.buyerId !== userId && chat.sellerId !== userId)) throw new CosmosPersistenceError('list');
    return { ...page, items: chats, totalRecords };
  }
}

export class CosmosMessageRepository implements MessageRepository {
  constructor(private readonly store: CosmosStore, private readonly validateEvent?: (event: MessageSent) => void) {}

  async append(message: Message, event: MessageSent): Promise<void> {
    if (event.messageId !== message.id || event.chatId !== message.chatId ||
        event.senderUserId !== message.senderUserId || event.recipientUserId !== message.recipientUserId ||
        event.sentAt !== message.sentAt) {
      throw new MessagingError('INVALID_MESSAGE', 'Event does not match message');
    }
    const pk = this.store.partitionKey;
    const messageRow = messageDocument(message, pk);
    const eventRow = eventDocument(event, pk);
    readMessage(messageRow, pk);
    this.validateEvent?.(event);
    const signal = deadline();
    try {
      await this.store.batchCreate([messageRow, { ...eventRow, outboxAvailableAt: event.sentAt }], signal);
    } catch (error) {
      if (hasStatus(error, 409)) conflict();
      if (commitUnknown(error) && !signal.aborted) {
        const reconciled = await Promise.all([
          this.store.read(messageRow.id, signal), this.store.read(eventRow.id, signal),
        ]).then(([m, e]) => sameDocument(m?.document, messageRow) && sameDocument(e?.document, eventRow),
          () => false);
        if (reconciled) return;
      }
      throw error;
    }
  }

  async listByChat(chatId: string, page: PageQuery): Promise<Page<Message>> {
    const { items, totalRecords } = await this.store.page(
      "c.kind = 'message' AND c.chatId = @chat", [{ name: '@chat', value: chatId }],
      'c.chatId ASC, c.sentAt ASC, c.sortId ASC', page.page, page.pageSize, deadline());
    const messages = items.map(item => readMessage(item, this.store.partitionKey));
    if (messages.some(message => message.chatId !== chatId)) throw new CosmosPersistenceError('list');
    return { ...page, items: messages, totalRecords };
  }
}
