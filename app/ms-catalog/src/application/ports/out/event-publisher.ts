import type { MessageSent } from '../../../domain/messaging.js';

export interface EventPublisher {
  publish(event: MessageSent, signal: AbortSignal): Promise<void>;
}
