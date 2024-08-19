import { Global, Injectable, Logger } from '@nestjs/common';
import { QueueBroadcastLog } from '@rumsan/connect/types';
import { TransportQueue } from './transport.queue';

@Global()
@Injectable()
export class BatchManger {
  private readonly logger = new Logger(BatchManger.name);

  public batchSize = +(process.env['BATCH_SIZE'] as string) || 20;
  public batchDelay = +(process.env['BATCH_DELAY'] as string) || 2000;
  public processingBroadcasts = new Map<
    string,
    {
      log: QueueBroadcastLog;
    }
  >();

  constructor(private readonly transportQueue: TransportQueue) {
    this.batchDelay = this.batchDelay < 2000 ? 2000 : this.batchDelay;
    console.log('Batch Size:', this.batchSize);
    console.log('Batch Delay:', this.batchDelay);
  }

  public startMonitoring(log: QueueBroadcastLog) {
    this.processingBroadcasts.set(log.broadcastLogId, {
      log,
    });
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
      console.log('End Monitorring');
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
}
