export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

/** Logger đơn giản ghi ra stdout/stderr, đủ dùng với pm2 / docker logs. */
export function createLogger(level: LogLevel = 'info', scope = 'app'): Logger {
  const min = LEVEL_WEIGHT[level];

  const write = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[lvl] < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
    const extra = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    (lvl === 'error' || lvl === 'warn' ? console.error : console.log)(line + extra);
  };

  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
    child: (child) => createLogger(level, `${scope}:${child}`),
  };
}

/** Logger im lặng – dùng trong test. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
