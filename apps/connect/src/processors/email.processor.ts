import {
  OnQueueActive,
  OnQueueCompleted,
  Process,
  Processor,
} from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import { EmailMessage, MessageBroadcast } from '@rsconnect/sdk/types';
import { Job } from 'bull';

@Injectable()
@Processor(QUEUES.TRANSPORT_ECHO)
export class EmailProcessor {
  private readonly _logger = new Logger(EmailProcessor.name);

  async process(data: MessageBroadcast): Promise<void> {
    const message: EmailMessage = data.message as EmailMessage;
    console.log(message.meta.subject);
  }

  @OnQueueActive()
  onActive(job: Job) {
    this._logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onComplete(job: Job) {
    this._logger.debug(`Completed job ${job.id} of type ${job.name}`);
  }

  @Process()
  async processSendEmail(job: Job<{ templateName: string; data: any }>) {
    this._logger.log(
      `sending email for template '${job.data.templateName}' to '${job.data.data.email}'`
    );
  }
}
