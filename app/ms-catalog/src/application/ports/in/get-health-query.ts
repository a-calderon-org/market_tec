import type { ServiceHealth } from '../../../domain/service-health.js';

export interface GetHealthQuery {
  getHealth(): ServiceHealth;
}
