import { Global, Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogStreamService } from './log-stream.service';

/**
 * Import LogStreamModule once in your root AppModule.
 *
 * What you get automatically:
 *   - GET /logs/stream  — SSE endpoint (streams all Logger output)
 *   - LogStreamService  — injectable globally (no need to re-import)
 *
 * Wire the logger in bootstrap() so every Logger call flows through:
 *   const logStream = app.get(LogStreamService);
 *   app.useLogger(logStream);
 */
@Global()
@Module({
  controllers: [LogsController],
  providers: [LogStreamService],
  exports: [LogStreamService],
})
export class LogStreamModule {}
