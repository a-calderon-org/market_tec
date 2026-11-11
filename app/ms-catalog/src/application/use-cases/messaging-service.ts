import { MessagingError, messagePage, messageText, messageTime } from '../../domain/messaging.js';
import type { Chat, Message, MessageSent, PageRequest } from '../../domain/messaging.js';
import type { AuthenticatedPrincipal, Messaging } from '../ports/in/messaging.js';
import type { ChatRepository } from '../ports/out/chat-repository.js';
import type { MessageRepository } from '../ports/out/message-repository.js';
import type { PublicationRepository } from '../ports/out/publication-repository.js';

function user(principal: AuthenticatedPrincipal): string {
  messageText(principal?.userId, 'userId', 64);
  return principal.userId;
}

export class MessagingService implements Messaging {
  constructor(private readonly chats: ChatRepository, private readonly messages: MessageRepository,
    private readonly publications: Pick<PublicationRepository, 'findById'>,
    private readonly nextId: () => string, private readonly now: () => number) {}

  private id(): string {
    const id = this.nextId();
    messageText(id, 'generated ID', 128);
    return id;
  }

  async start(principal: AuthenticatedPrincipal, publicationId: string): Promise<Chat> {
    const buyerId = user(principal);
    messageText(publicationId, 'publicationId', 128);
    const publication = await this.publications.findById(publicationId);
    if (!publication) throw new MessagingError('CHAT_NOT_FOUND', 'Publication not found');
    const sellerId = publication.ownerId;
    messageText(sellerId, 'sellerId', 64);
    if (buyerId === sellerId) throw new MessagingError('CHAT_FORBIDDEN', 'Cannot contact yourself');
    return this.chats.getOrCreate({ id: this.id(), publicationId, buyerId, sellerId, createdAt: messageTime(this.now()) });
  }

  async listChats(principal: AuthenticatedPrincipal, page: PageRequest = {}) {
    return this.chats.listForParticipant(user(principal), messagePage(page));
  }

  private async authorized(userId: string, chatId: string): Promise<Chat> {
    messageText(chatId, 'chatId', 128);
    const chat = await this.chats.findById(chatId);
    if (!chat) throw new MessagingError('CHAT_NOT_FOUND', 'Chat not found');
    if (userId !== chat.buyerId && userId !== chat.sellerId) {
      throw new MessagingError('CHAT_FORBIDDEN', 'Only chat participants may access messages');
    }
    return chat;
  }

  async listMessages(principal: AuthenticatedPrincipal, chatId: string, page: PageRequest = {}) {
    await this.authorized(user(principal), chatId);
    return this.messages.listByChat(chatId, messagePage(page));
  }

  async send(principal: AuthenticatedPrincipal, chatId: string, texto: string, correlationId: string): Promise<Message> {
    const senderUserId = user(principal);
    const chat = await this.authorized(senderUserId, chatId);
    messageText(texto, 'texto', 5000);
    messageText(correlationId, 'correlationId', 128);
    const message: Message = { id: this.id(), chatId, senderUserId,
      recipientUserId: senderUserId === chat.buyerId ? chat.sellerId : chat.buyerId,
      texto, sentAt: messageTime(this.now()) };
    const event: MessageSent = { eventId: this.id(), correlationId, publicationId: chat.publicationId,
      messageId: message.id, chatId, senderUserId, recipientUserId: message.recipientUserId, sentAt: message.sentAt };
    await this.messages.append(message, event);
    return message;
  }
}
