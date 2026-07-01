import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { UsageBackfillService } from './usage.backfill.service';

export const USAGE_BACKFILL_QUEUE = 'rsconnect.usage.backfill';
export const USAGE_BACKFILL_JOB = 'backfill';

@Processor(USAGE_BACKFILL_QUEUE)
export class UsageBackfillWorker {
  private readonly logger = new Logger(UsageBackfillWorker.name);

  constructor(
    private readonly usageBackfillService: UsageBackfillService,
  ) {}

  @Process(USAGE_BACKFILL_JOB)
  async processBackfill(job: Job<{ batchSize: number; concurrency: number }>) {
    const { batchSize, concurrency } = job.data;
    this.logger.log(
      `Processing backfill job ${job.id}: batchSize=${batchSize}, concurrency=${concurrency}`,
    );
    const result = await this.usageBackfillService.backfill(
      batchSize,
      concurrency,
    );
    this.logger.log(`Backfill job ${job.id} complete: ${result.total} sessions`);
    return result;
  }
}
