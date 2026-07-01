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

@Global()
@Injectable()
export class BatchManger implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchManger.name);

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

  public async endMonitoring(
    broadcastLogId: string,
    //details?: Record<string, string>,
  ) {
    const broadcast = this.processingBroadcasts.get(broadcastLogId);
    if (!broadcast) {
      return;
    }
    //console.log('BroadcastProcessing:', this.processingBroadcasts.size);
    this.processingBroadcasts.delete(broadcastLogId);

    if (this.processingBroadcasts.size === 0) {
      console.log('End Monitoring');
      setTimeout(async () => {
        await this.transportQueue.confirmReadiness({
          sessionCuid: broadcast.log.sessionId,
          maxBatchSize: this.batchSize,
        });
      }, this.batchDelay);
    }

    // broadcast.isComplete = isComplete;
    // if (details) {
    //   broadcast.details = details;
    // }
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
