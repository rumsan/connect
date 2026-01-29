import {
  OnQueueActive,
  OnQueueCompleted,
  Process,
  Processor,
} from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  EmailMessage,
  MessageBroadcast,
  TransportType,
} from '@rumsan/connect/types';
import { Job } from 'bull';
import { BroadcastService } from '../broadcast/broadcast.service';

@Injectable()
@Processor(QUEUES.SCHEDULED)
export class ScheduleProcessor {
  private readonly _logger = new Logger(ScheduleProcessor.name);
  constructor(private readonly broadcastService: BroadcastService) {}
  async process(data: MessageBroadcast): Promise<void> {
    const message: EmailMessage = data.message as EmailMessage;
    console.log({ message });
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

  @Process('schedule')
  async processSchedule(job: Job) {
    console.log(job.data);
    this.broadcastService.checkTransportReadiness(
      job.data.sessionCuid,
      job.data.transportType as TransportType,
    );
    return { a: 1 };
  }
}
