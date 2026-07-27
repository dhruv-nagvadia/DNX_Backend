import { isProd } from '@/config';

/**
 * Tiny structured logger. Swap the internals for pino/winston later without
 * touching call sites.
 */
type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, message: string, meta?: unknown) {
  const time = new Date().toISOString();
  const line = `[${time}] [${level.toUpperCase()}] ${message}`;
  // eslint-disable-next-line no-console
  const out = level === 'error' ? console.error : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

export const logger = {
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (!isProd) log('debug', msg, meta);
  },
};
