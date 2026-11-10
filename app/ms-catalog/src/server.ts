import { createApp } from './app.js';
import { loadSettings } from './config/settings.js';
import { composePublications } from './config/publications.js';

const settings = loadSettings();
const app = createApp(settings, settings.publications ? composePublications(settings.publications) : undefined);

app.listen(settings.port, () => {
  console.info(JSON.stringify({
    level: 'info',
    event: 'service_started',
    service: settings.serviceName,
    port: settings.port,
    publications: settings.publications ? { store: settings.publications.store, persistent: false } : 'disabled',
    timestamp: Math.floor(Date.now() / 1000),
  }));
});
