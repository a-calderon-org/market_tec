import { ConsistencyLevel, CosmosClient, IndexingMode, PartitionKeyKind, PartitionKeyDefinitionVersion } from '@azure/cosmos';
import type { CompositePath, ContainerDefinition } from '@azure/cosmos';
import { ManagedIdentityCredential } from '@azure/identity';
import { CosmosChatRepository, CosmosMessageRepository } from '../adapters/out/cosmos/messaging-repositories.js';
import { CosmosPublicationRepository } from '../adapters/out/cosmos/publication-repository.js';
import { CosmosStore, deadline } from '../adapters/out/cosmos/store.js';
import type { CosmosMetrics } from '../adapters/out/cosmos/store.js';

const partition = { publications: 'publications-v1', chats: 'chats-v1', messages: 'messages-v1' };

export const defaultCatalogContainers = { publications: 'publicaciones', chats: 'chats', messages: 'mensajes' };
type CatalogContainers = typeof defaultCatalogContainers;

export interface CosmosCatalogSettings {
  database: string;
  containers: CatalogContainers;
}

export interface CosmosConnectionSettings extends CosmosCatalogSettings {
  readonly endpoint: string;
  readonly authentication: { readonly type: 'key'; readonly key: string } |
    { readonly type: 'managed-identity'; readonly clientId?: string };
}

export function cosmosOrigin(endpoint: string | undefined): URL {
  const url = URL.parse(endpoint ?? '');
  if (!url || url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CATALOG_COSMOS_ENDPOINT must be the HTTPS origin of the Cosmos account');
  }
  return url;
}

export function createCosmosClient(endpoint: string, authentication: CosmosConnectionSettings['authentication']): CosmosClient {
  const url = cosmosOrigin(endpoint);
  const credentials = authentication.type === 'key' ? { key: authentication.key } : {
    aadCredentials: authentication.clientId
      ? new ManagedIdentityCredential({ clientId: authentication.clientId })
      : new ManagedIdentityCredential(),
  };
  return new CosmosClient({ endpoint: url.origin, ...credentials, consistencyLevel: ConsistencyLevel.Session,
    connectionPolicy: {
      enableEndpointDiscovery: !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      useMultipleWriteLocations: false,
      requestTimeout: 5_000,
      retryOptions: { maxRetryAttemptCount: 3, maxWaitTimeInSeconds: 5 },
    },
  });
}

function sort(field: string, order: 'ascending' | 'descending'): CompositePath {
  return { path: '/' + field, order };
}

export function catalogContainerDefinitions(names: CatalogContainers = defaultCatalogContainers): ContainerDefinition[] {
  const stableId = sort('sortId', 'ascending');
  const publicationOrders = ['createdAtMs', 'precio'].flatMap(field => [
    [sort(field, 'ascending'), stableId], [sort(field, 'descending'), stableId],
  ]);
  function definition(id: string, paths: string[], compositeIndexes: CompositePath[][]): ContainerDefinition {
    return {
      id,
      partitionKey: { paths: ['/pk'], kind: PartitionKeyKind.Hash, version: PartitionKeyDefinitionVersion.V2 },
      indexingPolicy: {
        automatic: true,
        indexingMode: IndexingMode.consistent,
        includedPaths: ['pk', 'kind', 'sortId', ...paths].map(path => ({ path: '/' + path + '/?' })),
        excludedPaths: [{ path: '/*' }],
        compositeIndexes,
      },
    };
  }
  return [
    definition(names.publications, ['ownerId', 'categoria', 'precio', 'createdAtMs', 'searchText'], publicationOrders),
    definition(names.chats, ['buyerId', 'sellerId', 'createdAt'], [[sort('createdAt', 'descending'), stableId]]),
    definition(names.messages, ['chatId', 'sentAt'], [[sort('chatId', 'ascending'), sort('sentAt', 'ascending'), stableId]]),
  ];
}

export async function composeCosmosCatalog(client: CosmosClient, settings: CosmosCatalogSettings, metrics?: CosmosMetrics) {
  const names = Object.values(settings.containers);
  const validName = (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name);
  if (!validName(settings.database) || names.some(name => !validName(name)) || new Set(names).size !== 3) {
    throw new Error('Expected valid database and distinct catalog container names');
  }
  const database = client.database(settings.database);
  const publications = new CosmosStore(database.container(settings.containers.publications), partition.publications, metrics);
  const chats = new CosmosStore(database.container(settings.containers.chats), partition.chats, metrics);
  const messages = new CosmosStore(database.container(settings.containers.messages), partition.messages, metrics);
  const signal = deadline();
  await Promise.all([publications.validate(signal), chats.validate(signal), messages.validate(signal)]);
  return {
    publications: new CosmosPublicationRepository(publications),
    chats: new CosmosChatRepository(chats),
    messages: new CosmosMessageRepository(messages),
  };
}
