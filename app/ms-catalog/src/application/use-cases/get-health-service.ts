import type { GetHealthQuery } from '../ports/in/get-health-query.js';
import type { ServiceHealth } from '../../domain/service-health.js';

export type EpochSecondsClock = () => number;

export class GetHealthService implements GetHealthQuery {
  public constructor(
    private readonly serviceName: string,
    private readonly now: EpochSecondsClock,
  ) {}

  public getHealth(): ServiceHealth {
    return {
      status: 'UP',
      service: this.serviceName,
      timestamp: this.now(),
    };
  }
}
