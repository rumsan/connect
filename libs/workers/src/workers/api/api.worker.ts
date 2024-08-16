import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportApiConfig,
} from '@rumsan/connect/types';
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
    private readonly transport: ApiTransport,
  ) {
    super(dataProvider, channel);
  }
  TransportQueue: QUEUES = QUEUES.TRANSPORT_API;
  private readonly logger = new Logger(ApiWorker.name);

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<{ sendLog: boolean; log: QueueBroadcastLog }> {
    const { session, broadcast, broadcastLog, jobData } = data;

    try {
      this.transport.init(session.Transport?.config as TransportApiConfig);
      const res = await this.transport.send(
        jobData.address,
        session.message as EmailMessage,
      );

      broadcastLog.status = BroadcastStatus.SUCCESS;
      broadcastLog.details = { messageId: res };
    } catch (e: any) {
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }

    // this.smtpService.send();

    return { sendLog: true, log: broadcastLog };
  }

  override async makeTransportReady(session: Session): Promise<boolean> {
    //TODO: Ping api to check if it is ready
    return true;
  }
}
