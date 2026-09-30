# @rsconnect/log-stream

NestJS `LoggerService` that intercepts every `Logger` call across the app and exposes the output as an RxJS `Observable<LogEntry>` — ready to pipe into an SSE controller or WebSocket gateway.

Terminal output is unchanged (still delegates to `ConsoleLogger`). New SSE clients receive the last N log lines immediately (ring buffer replay), then stream live.

## Install

```bash
pnpm add @rsconnect/log-stream
```

## Setup

### 1. Import the module

```typescript
// app.module.ts
import { LogStreamModule } from '@rsconnect/log-stream';

@Module({
  imports: [LogStreamModule, /* ... */],
})
export class AppModule {}
```

### 2. Wire as the app logger in bootstrap

```typescript
// main.ts
import { LogStreamService } from '@rsconnect/log-stream';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(LogStreamService));
  app.enableCors();
  await app.listen(3000);
}
```

### 3. Add an SSE endpoint

```typescript
import { Controller, Header, MessageEvent, Sse } from '@nestjs/common';
import { LogStreamService } from '@rsconnect/log-stream';
import { map, Observable } from 'rxjs';

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
```

### 4. Frontend

```js
const es = new EventSource('http://localhost:3000/api/logs/stream');
es.onmessage = (e) => {
  const { timestamp, level, context, message } = JSON.parse(e.data);
  console.log(`[${context}] ${message}`);
};
```

## LogEntry shape

```typescript
interface LogEntry {
  timestamp: string;  // ISO 8601
  level: 'log' | 'warn' | 'error' | 'debug' | 'verbose';
  context: string;    // NestJS Logger context (class name)
  message: string;
}
```

## Options

`LogStreamService` constructor accepts `maxBuffer` (default `200`) — how many recent entries to replay to new clients:

```typescript
// override the provider if you need a custom buffer size
{ provide: LogStreamService, useFactory: () => new LogStreamService(500) }
```
