const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const formatTimestamp = () => new Date().toISOString();

const log = (level, message, meta = {}) => {
  if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return;

  const prefix = `[${formatTimestamp()}] [${level.toUpperCase()}]`;
  const metaStr = Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : '';

  if (level === 'error') {
    console.error(`${prefix} ${message}${metaStr}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${metaStr}`);
  } else {
    console.log(`${prefix} ${message}${metaStr}`);
  }
};

const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};

module.exports = logger;
