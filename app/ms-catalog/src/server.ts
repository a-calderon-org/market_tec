import { once } from 'node:events';
import { CosmosPersistenceError } from './adapters/out/cosmos/store.js';
import { createCatalogRuntime } from './config/catalog-runtime.js';
import { loadSettings } from './config/settings.js';

async function start() {
  const settings = loadSettings();
  const runtime = await createCatalogRuntime(settings, {}, metric => {
    const failed = (metric.status ?? 0) >= 400;
    if (settings.logLevel === 'silent' || (!failed && settings.logLevel !== 'debug')) return;
    if (failed && settings.logLevel === 'error') return;
    console.info(JSON.stringify({
      level: failed ? 'warn' : 'debug',
      event: 'cosmos_operation',
      service: settings.serviceName,
      ...metric,
      timestamp: Math.floor(Date.now() / 1000),
    }));
  });

  const server = runtime.app.listen(settings.port);
  try {
    await once(server, 'listening');
  } catch (error) {
    runtime.dispose();
    throw error;
  }
  server.once('close', runtime.dispose);
  const stop = () => {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    server.close();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  console.info(JSON.stringify({
    level: 'info',
    event: 'service_started',
    service: settings.serviceName,
    port: settings.port,
    publications: settings.publications ? { store: settings.publications.store,
      persistent: settings.publications.store === 'cosmos' } : 'disabled',
    timestamp: Math.floor(Date.now() / 1000),
  }));
}

try {
  await start();
} catch (error) {
  console.error(JSON.stringify({
    level: 'error',
    event: 'service_start_failed',
    errorType: error instanceof Error ? error.name : 'UnknownError',
    ...(error instanceof CosmosPersistenceError ? { operation: error.operation, status: error.status } : {}),
  }));
  process.exitCode = 1;
}
