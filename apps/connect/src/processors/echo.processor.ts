import {
  OnQueueActive,
  OnQueueCompleted,
  Process,
  Processor,
} from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { EmailMessage, MessageBroadcast } from '@rumsan/connect/types';
import { Job } from 'bull';

@Injectable()
@Processor(QUEUES.TRANSPORT_ECHO)
export class EchoProcessor {
  private readonly _logger = new Logger(EchoProcessor.name);

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
    console.log(job.returnvalue);
    this._logger.debug(`Completed job ${job.id} of type ${job.name}`);
  }

  @Process('broadcast')
  async processSendEmail(job: Job) {
    console.log(job.opts);
    return { a: 1 };
  }
}
