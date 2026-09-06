import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { LogStreamService } from './log-stream.service';

/**
 * Idle connections are dropped by most proxies after ~60s, and each reconnect
 * costs the client a full replay of the buffer, so keep the socket busy.
 */
const HEARTBEAT_MS = 15_000;

/**
 * Registered automatically when LogStreamModule is imported.
 * Provides GET /logs/stream as an SSE endpoint.
 *
 * Frontend:
 *   const es = new EventSource('http://host/api/logs/stream');
 *   es.onmessage = (e) => console.log(JSON.parse(e.data));
 */
@Controller('logs')
export class LogsController {
  constructor(private readonly logStream: LogStreamService) {}

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const entries = this.logStream
      .getStream()
      .pipe(map((entry) => ({ data: entry } as MessageEvent)));

    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: '' } as MessageEvent)),
    );

    return merge(entries, heartbeat);
  }
}
