import { GetHealthService } from '../application/use-cases/get-health-service.js';
import type { GetHealthQuery } from '../application/ports/in/get-health-query.js';
import type { Settings } from './settings.js';

export interface Container {
  readonly getHealthQuery: GetHealthQuery;
}

export function createContainer(settings: Settings): Container {
  return {
    getHealthQuery: new GetHealthService(
      settings.serviceName,
      () => Math.floor(Date.now() / 1000),
    ),
  };
}
