import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportApiConfig,
} from '@rsconnect/sdk/types';
import { ApiTransport } from '@rsconnect/transports';
import { ChannelWrapper } from 'amqp-connection-manager';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';

@Injectable()
export class ApiWorker extends TransportWorker {
  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    private readonly transport: ApiTransport
  ) {
    super(dataProvider, channel);
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
      this.transport.init(session.Transport?.config as TransportApiConfig);
      const res = await this.transport.send(
        data.address,
        session.message as EmailMessage
      );

      logData.status = BroadcastStatus.SUCCESS;
      logData.details = { messageId: res };
    } catch (e: any) {
      logData.status = BroadcastStatus.FAIL;
      logData.details = { error: e.message };
    }

    // this.smtpService.send();

    return logData;
  }
}
