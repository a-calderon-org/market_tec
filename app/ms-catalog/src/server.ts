import { createApp } from './app.js';
import { loadSettings } from './config/settings.js';

const settings = loadSettings();
const app = createApp(settings);

app.listen(settings.port, () => {
  console.info(JSON.stringify({
    level: 'info',
    event: 'service_started',
    service: settings.serviceName,
    port: settings.port,
    timestamp: Math.floor(Date.now() / 1000),
  }));
});
