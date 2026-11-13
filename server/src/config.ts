import { DEFAULT_SERVER_PORT, RECONNECT_GRACE_MS } from '@tmf/shared';
import type { LogLevel } from './util/logger';

export type Environment = 'development' | 'production' | 'test';

export interface ServerConfig {
  env: Environment;
  port: number;
  host: string;
  /** Allowed browser origins for cross-origin clients. `true` = any (development only). */
  clientOrigins: string[] | true;
  serveClient: boolean;
  reconnectGraceMs: number;
  logLevel: LogLevel;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv: Environment = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';

  const port = Number.parseInt(env.PORT ?? '', 10);
  const origins = (env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const logLevel = LOG_LEVELS.includes(env.LOG_LEVEL as LogLevel) ? (env.LOG_LEVEL as LogLevel) : 'info';

  return {
    env: nodeEnv,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_SERVER_PORT,
    host: env.HOST || '0.0.0.0',
    // In development any origin may connect (Vite on localhost, LAN testing).
    // In production only listed origins may connect cross-origin; same-origin always works.
    clientOrigins: origins.length ? origins : nodeEnv === 'development' ? true : [],
    serveClient: env.SERVE_CLIENT ? env.SERVE_CLIENT === 'true' : nodeEnv === 'production',
    reconnectGraceMs: RECONNECT_GRACE_MS,
    logLevel,
  };
}
