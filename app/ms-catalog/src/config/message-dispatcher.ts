import { setTimeout as delay } from 'node:timers/promises';
import { ManagedIdentityCredential } from '@azure/identity';
import { QueueClient } from '@azure/storage-queue';
import { AzureQueueEventPublisher } from '../adapters/out/azure-queue-event-publisher.js';
import type { MessageOutbox } from '../application/ports/out/message-outbox.js';
import { DispatchMessageEvents, type DispatchNotice } from '../application/use-cases/dispatch-message-events.js';
import { isUuid } from '../domain/messaging.js';
import { CosmosPersistenceError } from '../adapters/out/cosmos/store.js';
import type { Settings } from './settings.js';

export function startMessageDispatcher(outbox: MessageOutbox, queue: NonNullable<Settings['messageQueue']>,
  settings: Settings, now: () => number): () => Promise<void> {
  const credential = queue.clientId ? new ManagedIdentityCredential({ clientId: queue.clientId }) :
    new ManagedIdentityCredential();
  const publisher = new AzureQueueEventPublisher(new QueueClient(queue.url, credential, { retryOptions: { maxTries: 1 } }));
  const stop = new AbortController();
  function report(notice: DispatchNotice) {
    if (settings.logLevel === 'silent') return;
    const { error, stage, event, outboxId, attempts, retryAt } = notice;
    const status = error instanceof CosmosPersistenceError ? error.status :
      error && typeof error === 'object' && 'statusCode' in error &&
      typeof error.statusCode === 'number' ? error.statusCode : undefined;
    console.error(JSON.stringify({ level: 'error', event: 'message_outbox_failed', service: settings.serviceName,
      stage, outboxId: outboxId && /^event:[\w-]+$/.test(outboxId) ? outboxId : undefined, attempts, retryAt, status,
      eventId: isUuid(event?.eventId) ? event.eventId : undefined,
      correlationId: isUuid(event?.correlationId) ? event.correlationId : undefined,
      timestamp: now() }));
  }
  const dispatcher = new DispatchMessageEvents(outbox, publisher, now, report);
  const worker = (async () => {
    while (!stop.signal.aborted) {
      await dispatcher.run(stop.signal);
      await delay(2000, undefined, { signal: stop.signal, ref: false }).catch(error => {
        if (!stop.signal.aborted) throw error;
      });
    }
  })();
  return async () => {
    stop.abort();
    await worker;
  };
}
