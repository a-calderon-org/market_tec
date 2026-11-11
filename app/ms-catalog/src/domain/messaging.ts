export class MessagingError extends Error {
  constructor(readonly code: 'INVALID_MESSAGE' | 'CHAT_NOT_FOUND' | 'CHAT_FORBIDDEN' | 'CHAT_CONFLICT', message: string) {
    super(message);
  }
}

// References are opaque catalog-owned IDs, never authoritative user profiles.
export interface Chat {
  readonly id: string;
  readonly publicationId: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly createdAt: number;
}

export interface Message {
  readonly id: string;
  readonly chatId: string;
  readonly senderUserId: string;
  readonly recipientUserId: string;
  readonly texto: string;
  readonly sentAt: number;
}

// Internal event, not the versioned wire envelope. No message text or profile data.
export interface MessageSent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly publicationId: string;
  readonly messageId: string;
  readonly chatId: string;
  readonly senderUserId: string;
  readonly recipientUserId: string;
  readonly sentAt: number;
}

export interface PageRequest { readonly page?: number; readonly pageSize?: number }
export interface PageQuery { readonly page: number; readonly pageSize: number }
export interface Page<T> extends PageQuery { readonly items: T[]; readonly totalRecords: number }

export function messageText(value: unknown, name: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new MessagingError('INVALID_MESSAGE', `Invalid ${name}`);
  }
}

export function messageTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 9999999999) {
    throw new MessagingError('INVALID_MESSAGE', 'Invalid message time');
  }
  return value;
}

export function messagePage(request: PageRequest): PageQuery {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new MessagingError('INVALID_MESSAGE', 'Invalid pagination');
  }
  const { page = 1, pageSize = 12 } = request;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)) {
    throw new MessagingError('INVALID_MESSAGE', 'Invalid pagination');
  }
  return { page, pageSize };
}
