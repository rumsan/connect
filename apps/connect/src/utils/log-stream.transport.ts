import { LogEntry, LogStreamService } from '@rsconnect/log-stream';
import * as winston from 'winston';
import { loggerLevel } from './winston.logger';

// winston exports the base transport class as `Transport` at runtime, but its
// type declarations name it `transport`. Bridge the two so we keep real typing.
const WinstonTransport = (winston as unknown as { Transport: unknown })
  .Transport as new (opts?: {
  level?: string;
  silent?: boolean;
}) => winston.transport;

// The logger-level format runs before transports, so by the time an entry
// reaches us the dev format has already colorized and uppercased it
// (e.g. "\x1b[32mINFO\x1b[39m"). Strip that back out for the SSE payload.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const LEVELS: Record<string, LogEntry['level']> = {
  error: 'error',
  warn: 'warn',
  info: 'log',
  http: 'log',
  verbose: 'verbose',
  debug: 'debug',
  silly: 'debug',
};

/**
 * Winston transport that mirrors every log line into LogStreamService, so the
 * SSE endpoint sees the same output as the console and file transports.
 *
 * Added to the logger at runtime in bootstrap() — see apps/connect/src/main.ts.
 */
export class LogStreamTransport extends WinstonTransport {
  constructor(private readonly logStream: LogStreamService) {
    // Without an explicit level this inherits the logger's default ('info')
    // and drops debug/verbose, even though the console transport shows them.
    super({ level: loggerLevel });
  }

  log(info: any, next: () => void): void {
    const level = String(info.level).replace(ANSI, '').toLowerCase();
    const message =
      typeof info.message === 'string'
        ? info.message.replace(ANSI, '')
        : info.message;

    this.logStream.ingest(LEVELS[level] ?? 'log', message, info.context);
    next();
  }
}
