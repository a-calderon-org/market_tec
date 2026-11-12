import type { MessageOutbox, OutboxCandidate, OutboxClaim } from '../../../application/ports/out/message-outbox.js';
import type { MessageSent } from '../../../domain/messaging.js';
import { document, fields, physicalId } from './documents.js';
import { CosmosPersistenceError, deadline, hasStatus } from './store.js';
import type { CosmosStore, StoredDocument } from './store.js';

export const outboxIndex = '/outboxAvailableAt/?';

function candidate(value: unknown): OutboxCandidate {
  const { id, _etag } = fields(value);
  if (typeof id !== 'string' || typeof _etag !== 'string' || !_etag) throw new CosmosPersistenceError('list');
  return { id, version: _etag };
}

function readEvent(value: unknown, pk: string): MessageSent {
  const data = document(value, 'event', pk);
  const { eventId, correlationId, publicationId, messageId, chatId, senderUserId, recipientUserId, sentAt } = data;
  if (typeof eventId !== 'string' || data.id !== physicalId('event', eventId) ||
      typeof correlationId !== 'string' || typeof publicationId !== 'string' || typeof messageId !== 'string' ||
      typeof chatId !== 'string' || typeof senderUserId !== 'string' || typeof recipientUserId !== 'string' ||
      typeof sentAt !== 'number') throw new CosmosPersistenceError('read');
  return { eventId, correlationId, publicationId, messageId, chatId, senderUserId, recipientUserId, sentAt };
}

export class CosmosMessageOutbox implements MessageOutbox {
  constructor(private readonly store: CosmosStore) {}

  async due(now: number, limit: number, signal: AbortSignal): Promise<OutboxCandidate[]> {
    const timeout = AbortSignal.any([signal, deadline()]);
    // MTEC-29 rows predate scheduling metadata. A small quota makes progress
    // on them even when new writes keep the main query full.
    const legacy = await this.store.select({
      query: "SELECT TOP @limit c.id, c._etag FROM c WHERE c.kind = 'event' AND NOT IS_DEFINED(c.outboxAvailableAt)",
      parameters: [{ name: '@limit', value: Math.ceil(limit / 2) }],
    }, timeout);
    const ready = await this.store.select({
      query: "SELECT TOP @limit c.id, c._etag FROM c WHERE c.kind = 'event' AND IS_NUMBER(c.outboxAvailableAt) AND c.outboxAvailableAt <= @now ORDER BY c.outboxAvailableAt ASC",
      parameters: [{ name: '@limit', value: limit - legacy.length }, { name: '@now', value: now }],
    }, timeout);
    return [...legacy, ...ready].map(candidate);
  }

  async claim(entry: OutboxCandidate, until: number, signal: AbortSignal): Promise<OutboxClaim | undefined> {
    const timeout = AbortSignal.any([signal, deadline()]);
    const row = await this.store.read(entry.id, timeout);
    if (!row || row.etag !== entry.version) return undefined;
    const { _etag, _rid, _self, _attachments, _ts, ...data } = fields(row.document);
    if (data.id !== entry.id || data.pk !== this.store.partitionKey || data.kind !== 'event' ||
        data.outboxPublishedAt !== undefined) return undefined;
    const previous = data.outboxAttempts ?? 0;
    if (typeof previous !== 'number' || !Number.isSafeInteger(previous) || previous < 0) {
      throw new CosmosPersistenceError('read');
    }
    const attempts = Math.min(previous + 1, Number.MAX_SAFE_INTEGER);
    const claimed = { ...data as StoredDocument, outboxAttempts: attempts, outboxAvailableAt: until };
    let version: string;
    try {
      version = await this.store.replace(claimed, entry.version, timeout);
    } catch (error) {
      if (hasStatus(error, 412)) return undefined;
      throw error;
    }
    if (!version) throw new CosmosPersistenceError('replace');
    return {
      attempts,
      readEvent: () => readEvent(claimed, this.store.partitionKey),
      retry: async (at, stop) => {
        await this.store.replace({ ...claimed, outboxAvailableAt: at }, version, AbortSignal.any([stop, deadline()]));
      },
      complete: async (at, stop) => {
        await this.store.replace({ ...claimed, outboxAvailableAt: null, outboxPublishedAt: at }, version,
          AbortSignal.any([stop, deadline()]));
      },
    };
  }
}
