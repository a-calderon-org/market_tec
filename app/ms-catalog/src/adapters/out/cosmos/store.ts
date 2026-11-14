import type { CompositePath, Container, JSONObject, SqlParameter, SqlQuerySpec } from '@azure/cosmos';

export type CosmosOperation = 'read' | 'create' | 'replace' | 'delete' | 'batch' | 'list' | 'count' | 'validate';
export type CosmosMetrics = (metric: {
  operation: CosmosOperation;
  durationMs: number;
  status: number | undefined;
  requestCharge: number | undefined;
  activityId: string | undefined;
}) => void;

export class CosmosPersistenceError extends Error {
  constructor(readonly operation: CosmosOperation, readonly status?: number) {
    super('Catalog storage could not complete the operation');
    this.name = 'CosmosPersistenceError';
  }
}

function statusOf(error: unknown): number | undefined {
  // SDK batch wraps the service error in cause. Never propagate its raw message.
  for (let depth = 0; depth < 3 && error && typeof error === 'object'; depth++) {
    if ('code' in error && typeof error.code === 'number') return error.code;
    if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
    error = 'cause' in error ? error.cause : undefined;
  }
  return undefined;
}

interface ResponseMetrics {
  requestCharge?: number;
  activityId?: string;
  code?: number | undefined;
  statusCode?: number | undefined;
}

export interface StoredDocument extends JSONObject {
  id: string;
  pk: string;
  kind: string;
  schemaVersion: 1;
}

export interface StoredItem {
  document: unknown;
  etag: string | undefined;
}

interface RequiredIndexes {
  paths: readonly string[];
  composites?: readonly (readonly CompositePath[])[];
}

function unquoteIndexPath(path: string): string {
  return path.replace(/^\/"([a-zA-Z0-9_]+)"(?=\/|$)/, '/$1');
}

export class CosmosStore {
  constructor(private readonly container: Container, readonly partitionKey: string,
    private readonly metrics?: CosmosMetrics) {}

  private async request<T extends ResponseMetrics>(operation: CosmosOperation,
    run: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let status: number | undefined;
    let requestCharge: number | undefined;
    let activityId: string | undefined;
    try {
      const result = await run();
      status = result.statusCode ?? result.code;
      if (Number.isFinite(result.requestCharge)) requestCharge = result.requestCharge;
      activityId = result.activityId;
      return result;
    } catch (error) {
      status = statusOf(error);
      throw new CosmosPersistenceError(operation, status);
    } finally {
      // Observability must not turn a committed write into a failed operation.
      try { this.metrics?.({ operation, durationMs: performance.now() - start, status, requestCharge, activityId }); } catch { /* observer failure */ }
    }
  }

  async validate(signal: AbortSignal, requiredIndexes?: RequiredIndexes): Promise<void> {
    const response = await this.request('validate', () => this.container.read({ abortSignal: signal }));
    const definition = response.resource?.partitionKey;
    if (definition?.kind !== 'Hash' || definition.paths?.length !== 1 || definition.paths[0] !== '/pk' ||
        (response.resource?.defaultTtl !== undefined && response.resource.defaultTtl !== -1)) {
      throw new CosmosPersistenceError('validate');
    }
    if (requiredIndexes) {
      const policy = response.resource?.indexingPolicy;
      const included = policy?.includedPaths?.map(({ path }) => unquoteIndexPath(path)) ?? [];
      const excluded = policy?.excludedPaths?.map(({ path }) => unquoteIndexPath(path)) ?? [];
      const hasPath = (path: string) => included.includes(path) ||
        (!excluded.includes(path) && (included.includes(path.replace('/?', '/*')) ||
          (included.includes('/*') && !excluded.includes(path.replace('/?', '/*')))));
      const hasComposite = (required: readonly CompositePath[]) => policy?.compositeIndexes?.some(index =>
        index.length === required.length && index.every(({ path }, i) => unquoteIndexPath(path) === required[i]?.path) &&
        (index.every(({ order }, i) => order === required[i]?.order) ||
          index.every(({ order }, i) => order !== required[i]?.order)));
      if (policy?.indexingMode !== 'consistent' || policy.automatic === false ||
          !requiredIndexes.paths.every(hasPath) || !(requiredIndexes.composites ?? []).every(hasComposite)) {
        throw new CosmosPersistenceError('validate');
      }
    }
  }

  async read(id: string, signal: AbortSignal): Promise<StoredItem | undefined> {
    const response = await this.request('read', () =>
      this.container.item(id, this.partitionKey).read({ abortSignal: signal }));
    if (response.statusCode === 404 && !response.substatus) {
      // The SDK returns a 404 ItemResponse for missing containers as well as items.
      await this.validate(signal);
      return undefined;
    }
    if (response.statusCode !== 200 || !response.resource) {
      throw new CosmosPersistenceError('read', response.statusCode);
    }
    return { document: response.resource, etag: response.resource._etag };
  }

  async create(document: StoredDocument, signal: AbortSignal): Promise<void> {
    const response = await this.request('create', () => this.container.items.create(document, { abortSignal: signal }));
    if (response.statusCode !== 201) throw new CosmosPersistenceError('create', response.statusCode);
  }

  async replace(document: StoredDocument, etag: string, signal: AbortSignal): Promise<string> {
    const response = await this.request('replace', () => this.container.item(document.id, this.partitionKey).replace(document, {
      accessCondition: { type: 'IfMatch', condition: etag },
      abortSignal: signal,
    }));
    if (response.statusCode !== 200) throw new CosmosPersistenceError('replace', response.statusCode);
    return response.etag || response.resource?._etag || '';
  }

  async delete(id: string, etag: string, signal: AbortSignal): Promise<void> {
    const response = await this.request('delete', () => this.container.item(id, this.partitionKey).delete({
      accessCondition: { type: 'IfMatch', condition: etag },
      abortSignal: signal,
    }));
    if (response.statusCode !== 204) throw new CosmosPersistenceError('delete', response.statusCode);
  }

  async batchCreate(documents: StoredDocument[], signal: AbortSignal): Promise<void> {
    const response = await this.request('batch', async () => {
      const result = await this.container.items.batch(
        documents.map(resourceBody => ({ operationType: 'Create', resourceBody })),
        this.partitionKey, { abortSignal: signal });
      const failure = result.result?.find(item => item.statusCode >= 400 && item.statusCode !== 424);
      return { ...result, code: failure?.statusCode ?? result.code,
        requestCharge: Number(result.headers['x-ms-request-charge']),
        activityId: String(result.headers['x-ms-activity-id'] ?? '') };
    });
    const results = response.result;
    if (!results || results.length !== documents.length || results.some(result => result.statusCode !== 201) ||
        response.code === undefined || response.code < 200 || response.code >= 300) {
      throw new CosmosPersistenceError('batch', response.code);
    }
  }

  private async query<T>(operation: 'list' | 'count', spec: SqlQuerySpec, signal: AbortSignal): Promise<T[]> {
    const iterator = this.container.items.query<T>(spec, {
      partitionKey: this.partitionKey,
      abortSignal: signal,
    });
    const items: T[] = [];
    while (iterator.hasMoreResults()) {
      const response = await this.request(operation, () => iterator.fetchNext());
      items.push(...response.resources);
    }
    return items;
  }

  async select(spec: SqlQuerySpec, signal: AbortSignal): Promise<unknown[]> {
    return this.query('list', spec, signal);
  }

  async page(where: string, parameters: SqlParameter[], order: string, page: number, pageSize: number,
    signal: AbortSignal): Promise<{ items: unknown[]; totalRecords: number }> {
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new CosmosPersistenceError('list');
    }
    const from = ' FROM c WHERE ' + where;
    const counts = await this.query<number>('count', { query: 'SELECT VALUE COUNT(1)' + from, parameters }, signal);
    const totalRecords = counts[0];
    if (counts.length !== 1 || typeof totalRecords !== 'number' || !Number.isSafeInteger(totalRecords) || totalRecords < 0) {
      throw new CosmosPersistenceError('count');
    }
    // Avoid an unbounded offset query for pages already outside the counted result.
    if (offset >= totalRecords) return { items: [], totalRecords };
    const items = await this.query<unknown>('list', {
      query: 'SELECT *' + from + ' ORDER BY ' + order + ' OFFSET @offset LIMIT @limit',
      parameters: [...parameters, { name: '@offset', value: offset }, { name: '@limit', value: pageSize }],
    }, signal);
    if (items.length > pageSize) throw new CosmosPersistenceError('list');
    return { items, totalRecords };
  }
}

export const deadline = () => AbortSignal.timeout(12_000);

export function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof CosmosPersistenceError && error.status !== undefined && statuses.includes(error.status);
}

export function commitUnknown(error: unknown): boolean {
  return error instanceof CosmosPersistenceError &&
    (error.status === undefined || error.status === 408 || error.status >= 500);
}
