import { Controller, Header, MessageEvent, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { LogStreamService } from './log-stream.service';

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
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  stream(): Observable<MessageEvent> {
    return this.logStream.getStream().pipe(
      map((entry) => ({ data: entry }) as MessageEvent),
    );
  }
}
