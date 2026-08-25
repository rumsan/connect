import {
  Global,
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BroadcastStatus, QueueBroadcastLog } from '@rumsan/connect/types';
import { BroadcastLogQueue } from './broadcast-log.queue';
import { TransportQueue } from './transport.queue';
import { WORKER_ID, WORKER_PRIORITY } from './worker-identity';

@Global()
@Injectable()
export class BatchManger implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchManger.name);

  /** Identity echoed on every READINESS_CONFIRM so connect can address the batch back. */
  public readonly workerId = WORKER_ID;
  public readonly priority = WORKER_PRIORITY;

  /** Max concurrent broadcasts this worker accepts — its capacity for assignment. */
  public batchSize = +(process.env['BATCH_SIZE'] as string) || 20;
  public batchDelay = +(process.env['BATCH_DELAY'] as string) || 2000;
  public ttlMs = +(process.env['BATCH_TTL_MS'] as string) || 120_000;
  public reaperIntervalMs =
    +(process.env['REAPER_INTERVAL_MS'] as string) || 60_000;
  public processingBroadcasts = new Map<
    string,
    {
      log: QueueBroadcastLog;
      createdAt: number;
      lastActivityAt: number;
    }
  >();
  private reaperTimer: NodeJS.Timeout | null = null;

  /**
   * True while a batch is still being handed to the transport. Suppresses the
   * "batch drained" confirm so an early failure (or a very fast hangup) can't
   * make us ask for more work before the current batch is even dispatched.
   */
  private dispatching = false;

  constructor(
    private readonly transportQueue: TransportQueue,
    @Optional() private readonly broadcastLogQueue?: BroadcastLogQueue,
  ) {
    this.batchDelay = this.batchDelay < 2000 ? 2000 : this.batchDelay;
    console.log('Batch Size:', this.batchSize);
    console.log('Batch Delay:', this.batchDelay);
  }

  onModuleInit() {
    if (!this.broadcastLogQueue) {
      // Shadow instance from TransportWorker constructor — skip reaper here;
      // the DI-provided singleton owns the reaper.
      return;
    }
    this.reaperTimer = setInterval(
      () => this.reap(),
      this.reaperIntervalMs,
    );
    this.reaperTimer.unref?.();
    this.logger.log(
      `Batch reaper started (ttl=${this.ttlMs}ms, interval=${this.reaperIntervalMs}ms)`,
    );
  }

  onModuleDestroy() {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  /** Call before dispatching a batch to the transport. */
  public beginBatch() {
    this.dispatching = true;
  }

  /**
   * Call once the whole batch has been handed to the transport. If nothing is
   * left in flight (every broadcast failed fast, or all calls already ended)
   * this is what asks connect for the next batch.
   */
  public finishBatch(sessionCuid: string) {
    this.dispatching = false;
    if (this.processingBroadcasts.size === 0) {
      this.scheduleReadinessConfirm(sessionCuid);
    }
  }

  public startMonitoring(uniqueId: string, log: QueueBroadcastLog) {
    const now = Date.now();
    this.processingBroadcasts.set(uniqueId, {
      log,
      createdAt: now,
      lastActivityAt: now,
    });
  }

  public touch(uniqueId: string) {
    const entry = this.processingBroadcasts.get(uniqueId);
    if (entry) entry.lastActivityAt = Date.now();
  }

  public getLog<T>(broadcastLogId: string): T {
    return this.processingBroadcasts.get(broadcastLogId)?.log as T;
  }

  public update(broadcastLogId: string, data: Partial<QueueBroadcastLog>) {
    const broadcast = this.processingBroadcasts.get(broadcastLogId);
    if (!broadcast) {
      return;
    }
    Object.assign(broadcast.log, data);
    broadcast.lastActivityAt = Date.now();
  }

  /**
   * Release a broadcast slot. `fallback` lets a caller drain a broadcast that
   * was never monitored — a transport failing before it produced a channel, for
   * instance — so an all-failed batch still asks for the next one instead of
   * leaving this worker idle for the rest of the session.
   */
  public async endMonitoring(
    broadcastLogId: string,
    fallback?: { sessionCuid: string; batchSize?: number },
  ) {
    const broadcast = this.processingBroadcasts.get(broadcastLogId);
    if (!broadcast && !fallback) {
      return;
    }
    this.processingBroadcasts.delete(broadcastLogId);

    const sessionCuid = broadcast?.log.sessionId ?? fallback?.sessionCuid;
    if (!sessionCuid) return;

    // Drained our share of the batch — ask connect for more work. With several
    // workers on a session this is what makes it free-worker-pull: whoever
    // empties first claims next, so throughput follows real capacity.
    if (!this.dispatching && this.processingBroadcasts.size === 0) {
      this.scheduleReadinessConfirm(sessionCuid);
    }
  }

  private scheduleReadinessConfirm(sessionCuid: string) {
    setTimeout(async () => {
      await this.transportQueue.confirmReadiness({
        sessionCuid,
        maxBatchSize: this.batchSize,
        workerId: this.workerId,
      });
    }, this.batchDelay);
  }

  private async reap() {
    if (!this.broadcastLogQueue) return;
    const now = Date.now();
    const expired: string[] = [];
    for (const [id, entry] of this.processingBroadcasts.entries()) {
      if (now - entry.lastActivityAt > this.ttlMs) expired.push(id);
    }
    if (expired.length === 0) return;
    for (const id of expired) {
      const entry = this.processingBroadcasts.get(id);
      if (!entry) continue;
      const ageMs = now - entry.createdAt;
      this.logger.warn(
        `Reaper expiring stuck broadcast ${id} (age=${ageMs}ms)`,
      );
      entry.log.status = BroadcastStatus.FAIL;
      (entry.log as QueueBroadcastLog & { details?: unknown }).details = {
        errorTag: 'REAPER_TIMEOUT',
        ageMs,
      };
      try {
        await this.broadcastLogQueue.addVoice(
          entry.log as Parameters<BroadcastLogQueue['addVoice']>[0],
        );
      } catch (err) {
        this.logger.error(
          `Reaper failed to emit FAIL log for ${id}: ${(err as Error).message}`,
        );
      }
      await this.endMonitoring(id);
    }
  }
}
