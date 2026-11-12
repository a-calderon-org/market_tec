import type { EventPublisher } from '../ports/out/event-publisher.js';
import type { MessageOutbox, OutboxCandidate, OutboxClaim } from '../ports/out/message-outbox.js';
import type { MessageSent } from '../../domain/messaging.js';

export type DispatchNotice = {
  readonly stage: 'poll' | 'claim' | 'publish' | 'retry' | 'complete';
  readonly event?: MessageSent;
  readonly outboxId?: string;
  readonly attempts?: number;
  readonly retryAt?: number;
  readonly error: unknown;
};

const LEASE_SECONDS = 60;
const OPERATION_MS = 12_000;
const BATCH_SIZE = 20;
const CONCURRENCY = 4;

export class DispatchMessageEvents {
  constructor(private readonly outbox: MessageOutbox, private readonly publisher: EventPublisher,
    private readonly now: () => number, private readonly report: (notice: DispatchNotice) => void) {}

  private async dispatch(entry: OutboxCandidate, signal: AbortSignal): Promise<void> {
    let claim: OutboxClaim | undefined;
    try {
      claim = await this.outbox.claim(entry, this.now() + LEASE_SECONDS, signal);
    } catch (error) {
      if (!signal.aborted) this.report({ stage: 'claim', outboxId: entry.id, error });
      return;
    }
    if (!claim || signal.aborted) return;

    let event: MessageSent | undefined;
    try {
      event = claim.readEvent();
      await this.publisher.publish(event, AbortSignal.any([signal, AbortSignal.timeout(OPERATION_MS)]));
    } catch (error) {
      if (signal.aborted) return;
      const retryAt = this.now() + Math.min(300, 5 * 2 ** Math.min(claim.attempts - 1, 6));
      this.report({ stage: 'publish', outboxId: entry.id, ...(event ? { event } : {}),
        attempts: claim.attempts, retryAt, error });
      try {
        await claim.retry(retryAt, signal);
      } catch (retryError) {
        if (!signal.aborted) this.report({ stage: 'retry', outboxId: entry.id, error: retryError });
      }
      return;
    }

    try {
      // The queue accepted the event. If this acknowledgement fails, the lease expires
      // and the next attempt publishes the same logical event again.
      await claim.complete(this.now(), signal);
    } catch (error) {
      if (!signal.aborted) this.report({ stage: 'complete', outboxId: entry.id, event, error });
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    let due: OutboxCandidate[];
    try {
      due = await this.outbox.due(this.now(), BATCH_SIZE, signal);
    } catch (error) {
      if (!signal.aborted) this.report({ stage: 'poll', error });
      return;
    }
    for (let index = 0; index < due.length && !signal.aborted; index += CONCURRENCY) {
      await Promise.all(due.slice(index, index + CONCURRENCY).map(entry => this.dispatch(entry, signal)));
    }
  }
}
