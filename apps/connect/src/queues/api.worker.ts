import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportApiConfig,
} from '@rumsan/connect/types';
import { TransportWorker } from './transport.worker';
import { PrismaService } from '@rumsan/prisma';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ApiTransport } from '@rsconnect/transports';

@Injectable()
export class ApiWorker extends TransportWorker {
  constructor(
    protected readonly prisma: PrismaService,
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper,
    private readonly transport: ApiTransport
  ) {
    super(prisma, channel);
  }
  TransportQueue: QUEUES = QUEUES.TRANSPORT_API;
  private readonly logger = new Logger(ApiWorker.name);

  async process(
    session: Session,
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog> {
    const logData: QueueBroadcastLog = {
      broadcast: data.broadcastId,
      attempt: +data.attempt + 1,
      status: BroadcastStatus.SUCCESS,
      queue: this.TransportQueue,
    };

    try {
      this.transport.init(session.Transport.config as TransportApiConfig);
      const res = await this.transport.send(
        data.address,
        session.message as EmailMessage
      );

      logData.status = BroadcastStatus.SUCCESS;
      logData.details = { messageId: res };
    } catch (e) {
      logData.status = BroadcastStatus.FAIL;
      logData.details = { error: e.message };
    }

    // this.smtpService.send();

    return logData;
  }
}
