import type { MessageSent } from '../../../domain/messaging.js';

export interface OutboxCandidate {
  readonly id: string;
  readonly version: string;
}

export interface OutboxClaim {
  readonly attempts: number;
  readonly readEvent: () => MessageSent;
  readonly retry: (at: number, signal: AbortSignal) => Promise<void>;
  readonly complete: (at: number, signal: AbortSignal) => Promise<void>;
}

export interface MessageOutbox {
  due(now: number, limit: number, signal: AbortSignal): Promise<OutboxCandidate[]>;
  claim(entry: OutboxCandidate, until: number, signal: AbortSignal): Promise<OutboxClaim | undefined>;
}
