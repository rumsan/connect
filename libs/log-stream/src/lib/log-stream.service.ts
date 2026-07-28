import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import { from, merge, Observable, Subject } from 'rxjs';
import { LogEntry } from './log-entry.interface';

@Injectable()
export class LogStreamService extends ConsoleLogger implements LoggerService {
  private readonly subject = new Subject<LogEntry>();
  private readonly buffer: LogEntry[] = [];
  private readonly maxBuffer: number;

  constructor(maxBuffer = 200) {
    super();
    this.maxBuffer = maxBuffer;
  }

  override log(message: any, context?: string): void {
    super.log(message, context);
    this._push('log', message, context);
  }

  override warn(message: any, context?: string): void {
    super.warn(message, context);
    this._push('warn', message, context);
  }

  override error(message: any, stack?: string, context?: string): void {
    super.error(message, stack, context);
    this._push('error', message, context ?? stack);
  }

  override debug(message: any, context?: string): void {
    super.debug(message, context);
    this._push('debug', message, context);
  }

  override verbose(message: any, context?: string): void {
    super.verbose(message, context);
    this._push('verbose', message, context);
  }

  private _push(level: LogEntry['level'], message: any, context?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? 'App',
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }
    this.subject.next(entry);
  }

  /**
   * Returns an Observable that:
   * 1. Immediately replays the last `maxBuffer` entries to new subscribers
   * 2. Then streams all future log entries live
   *
   * Use this as the source for an SSE controller (`@Sse`) or a WebSocket gateway.
   */
  getStream(): Observable<LogEntry> {
    return merge(from([...this.buffer]), this.subject.asObservable());
  }
}
