import type { QueueClient } from '@azure/storage-queue';
import type { EventPublisher } from '../../application/ports/out/event-publisher.js';
import { isUuid, messageText, messageTime } from '../../domain/messaging.js';
import type { MessageSent } from '../../domain/messaging.js';

export function validateMessageSentV1(event: MessageSent): void {
  const { eventId, correlationId, publicationId, messageId, chatId, senderUserId, recipientUserId, sentAt } = event;
  if (!isUuid(eventId) || !isUuid(correlationId) || senderUserId === recipientUserId) {
    throw new Error('Invalid message.sent v1 identity');
  }
  messageText(publicationId, 'publicationId', 128);
  messageText(messageId, 'messageId', 128);
  messageText(chatId, 'chatId', 128);
  messageText(senderUserId, 'senderUserId', 64);
  messageText(recipientUserId, 'recipientUserId', 64);
  messageTime(sentAt);
}

export class AzureQueueEventPublisher implements EventPublisher {
  constructor(private readonly queue: {
    sendMessage: (...args: Parameters<QueueClient['sendMessage']>) => Promise<unknown>;
  }) {}

  async publish(event: MessageSent, signal: AbortSignal): Promise<void> {
    validateMessageSentV1(event);
    const { eventId, correlationId, chatId, messageId, senderUserId, recipientUserId, sentAt, publicationId } = event;
    // Queue's REST API wraps JSON in XML 1.0, which excludes these two code points.
    const body = JSON.stringify({
      eventId, eventType: 'message.sent', schemaVersion: 1, occurredAt: sentAt, producer: 'ms-catalog', correlationId,
      payload: { chatId, messageId, senderUserId, recipientUserId, sentAt, publicationId },
    }).replace(/[\uFFFE\uFFFF]/g, character => '\\u' + character.charCodeAt(0).toString(16));
    if (Buffer.byteLength(body, 'utf8') > 65_536) throw new Error('message.sent v1 exceeds Azure Queue limit');
    await this.queue.sendMessage(body, { abortSignal: signal, messageTimeToLive: -1 });
  }
}
