export interface ServiceHealth {
  readonly status: 'UP';
  readonly service: string;
  readonly timestamp: number;
}
