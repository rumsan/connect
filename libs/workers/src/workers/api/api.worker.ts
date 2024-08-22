import { Inject, Injectable, Logger } from '@nestjs/common';
import { BroadcastLogQueue, TransportQueue } from '@rsconnect/queue';
import { ApiTransport } from '@rsconnect/transports';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  Message,
  QueueBroadcastLog,
  Session,
  TransportApiConfig,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';

@Injectable()
export class ApiWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_API;

  private readonly logger = new Logger(ApiWorker.name);
  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    override readonly transportQueue: TransportQueue,
    private readonly transport: ApiTransport,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    super(dataProvider, channel, transportQueue);
  }

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    const { session, broadcast, broadcastLog, broadcastJob } = data;

    try {
      this.transport.init(session.Transport?.config as TransportApiConfig);
      const res = await this.transport.send(
        broadcastJob.address,
        session.message as Message,
      );

      broadcastLog.status = BroadcastStatus.SUCCESS;
      broadcastLog.details = { messageId: res };
    } catch (e: any) {
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }

    //send log to connect server
    await this.broadcastLogQueue.add(broadcastLog);
    //remove job from batchManager
    await this.batchManager.endMonitoring(broadcastJob.broadcastLogId);

    return broadcastLog;
  }

  async makeTransportReady(session: Session): Promise<boolean> {
    //TODO: Ping api to check if it is ready
    return true;
  }
}
