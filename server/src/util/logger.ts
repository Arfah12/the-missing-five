export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const min = ORDER[level];
  const write = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (ORDER[lvl] < min) return;
    const time = new Date().toISOString().slice(11, 19);
    const extra = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `${time} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra}`;
    if (lvl === 'error') console.error(line);
    else if (lvl === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, x) => write('debug', m, x),
    info: (m, x) => write('info', m, x),
    warn: (m, x) => write('warn', m, x),
    error: (m, x) => write('error', m, x),
  };
}

/** Logger that prints nothing (tests). */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
