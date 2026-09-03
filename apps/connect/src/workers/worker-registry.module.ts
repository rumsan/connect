import { Global, Module } from '@nestjs/common';
import { WorkerRegistry } from './worker-registry.service';

/**
 * Global so both the LogWorker (which feeds it heartbeats) and the assignment
 * service (which reads it) share one roster.
 */
@Global()
@Module({
  providers: [WorkerRegistry],
  exports: [WorkerRegistry],
})
export class WorkerRegistryModule {}
