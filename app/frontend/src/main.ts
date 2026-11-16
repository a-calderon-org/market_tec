import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { showBootFailure } from './app/core/boot/boot-splash';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error(err);
  showBootFailure(document);
});
