import type { Chat, Message, Page, PageRequest } from '../../../domain/messaging.js';

// Supplied by a trusted authentication adapter; never built from request body IDs.
export interface AuthenticatedPrincipal { readonly userId: string }

export interface Messaging {
  start(principal: AuthenticatedPrincipal, publicationId: string): Promise<Chat>;
  listChats(principal: AuthenticatedPrincipal, page?: PageRequest): Promise<Page<Chat>>;
  listMessages(principal: AuthenticatedPrincipal, chatId: string, page?: PageRequest): Promise<Page<Message>>;
  send(principal: AuthenticatedPrincipal, chatId: string, texto: string, correlationId: string): Promise<Message>;
}
