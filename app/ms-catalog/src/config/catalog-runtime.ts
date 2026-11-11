import { randomUUID } from 'node:crypto';
import { createApp } from '../app.js';
import { MessagingService } from '../application/use-cases/messaging-service.js';
import type { CosmosMetrics } from '../adapters/out/cosmos/store.js';
import { composeCosmosCatalog, createCosmosClient } from './cosmos-catalog.js';
import { composePublications, type PublicationRuntimeOptions } from './publications.js';
import type { Settings } from './settings.js';

export async function createCatalogRuntime(settings: Settings,
  options: Omit<PublicationRuntimeOptions, 'repository'> = {}, metrics?: CosmosMetrics) {
  const publications = settings.publications;
  if (publications?.store !== 'cosmos') {
    return {
      app: createApp(settings, publications ? composePublications(publications, options) : undefined),
      dispose() {},
    };
  }
  const cosmos = settings.cosmos;
  if (!cosmos) throw new Error('Cosmos settings are required for persistent catalog storage');
  const client = createCosmosClient(cosmos.endpoint, cosmos.authentication);
  try {
    const repositories = await composeCosmosCatalog(client, cosmos, metrics);
    const app = createApp(settings, composePublications(publications, { ...options, repository: repositories.publications }));
    const messaging = new MessagingService(repositories.chats, repositories.messages, repositories.publications,
      randomUUID, () => Math.floor(Date.now() / 1000));
    return { app, messaging, dispose: () => client.dispose() };
  } catch (error) {
    client.dispose();
    throw error;
  }
}
