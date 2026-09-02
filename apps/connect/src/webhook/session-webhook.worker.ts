import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  SESSION_WEBHOOK_JOB,
  SESSION_WEBHOOK_QUEUE,
  SessionWebhookJobData,
} from './session-webhook.queue';
import {
  PermanentWebhookError,
  SessionWebhookService,
} from './session-webhook.service';

@Processor(SESSION_WEBHOOK_QUEUE)
export class SessionWebhookWorker {
  private readonly logger = new Logger(SessionWebhookWorker.name);

  constructor(
    private readonly sessionWebhookService: SessionWebhookService,
  ) {}

  @Process(SESSION_WEBHOOK_JOB)
  async deliver(job: Job<SessionWebhookJobData>) {
    const { sessionCuid } = job.data;

    try {
      return await this.sessionWebhookService.deliver(sessionCuid);
    } catch (error) {
      if (error instanceof PermanentWebhookError) {
        // Retrying a rejected payload or a bad url only burns attempts.
        this.logger.warn(
          `Discarding completion webhook for session ${sessionCuid}: ${error.message}`,
        );
        await job.discard();
        throw error;
      }

      this.logger.warn(
        `Completion webhook for session ${sessionCuid} failed on attempt ${job.attemptsMade + 1}: ${error.message}`,
      );
      // Rethrow so Bull applies the configured backoff and retries.
      throw error;
    }
  }
}
