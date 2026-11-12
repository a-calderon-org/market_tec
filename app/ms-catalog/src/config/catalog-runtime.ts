import { randomUUID } from 'node:crypto';
import { createApp } from '../app.js';
import { MessagingService } from '../application/use-cases/messaging-service.js';
import type { CosmosMetrics } from '../adapters/out/cosmos/store.js';
import { composeCosmosCatalog, createCosmosClient } from './cosmos-catalog.js';
import { startMessageDispatcher } from './message-dispatcher.js';
import { composePublications, type PublicationRuntimeOptions } from './publications.js';
import type { Settings } from './settings.js';

export async function createCatalogRuntime(settings: Settings,
  options: Omit<PublicationRuntimeOptions, 'repository'> = {}, metrics?: CosmosMetrics) {
  const publications = settings.publications;
  const queue = settings.messageQueue;
  if (publications?.store !== 'cosmos') {
    if (queue) throw new Error('Message delivery requires persistent Cosmos storage');
    return {
      app: createApp(settings, publications ? composePublications(publications, options) : undefined),
      async dispose() {},
    };
  }
  const cosmos = settings.cosmos;
  if (!cosmos) throw new Error('Cosmos settings are required for persistent catalog storage');
  const client = createCosmosClient(cosmos.endpoint, cosmos.authentication);
  try {
    const repositories = await composeCosmosCatalog(client, cosmos, metrics, !!queue);
    const publicationHttp = composePublications(publications, { ...options, repository: repositories.publications });
    const now = () => Math.floor(Date.now() / 1000);
    const messaging = new MessagingService(repositories.chats, repositories.messages, repositories.publications,
      randomUUID, now);
    const app = createApp(settings, publicationHttp, queue ? { messaging, authenticate: publicationHttp.authenticate } : undefined);
    const stopDispatcher = queue && startMessageDispatcher(repositories.outbox, queue, settings, now);
    return { app, messaging, async dispose() {
      try {
        if (stopDispatcher) await stopDispatcher();
      } finally {
        client.dispose();
      }
    } };
  } catch (error) {
    client.dispose();
    throw error;
  }
}
