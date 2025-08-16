export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const envLevel =
  (typeof process !== 'undefined' && (process.env.LOG_LEVEL as LogLevel)) || 'info';
const currentLevel = levels[envLevel] ?? levels.info;

function log(level: LogLevel, ...args: unknown[]) {
  if (levels[level] < currentLevel) return;
  if (level === 'warn') {
    console.warn(...args);
  } else if (level === 'error') {
    console.error(...args);
  } else {
    console.log(...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
