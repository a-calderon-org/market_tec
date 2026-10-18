export interface Settings {
  readonly port: number;
  readonly serviceName: string;
  readonly logLevel: LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const logLevel = value?.trim().toLowerCase() || 'info';
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
    throw new Error('LOG_LEVEL must be one of debug, info, warn, error or silent');
  }
  return logLevel as LogLevel;
}

export function loadSettings(environment: NodeJS.ProcessEnv = process.env): Settings {
  return {
    port: parsePort(environment.PORT),
    serviceName: environment.SERVICE_NAME?.trim() || 'ms-catalog',
    logLevel: parseLogLevel(environment.LOG_LEVEL),
  };
}
