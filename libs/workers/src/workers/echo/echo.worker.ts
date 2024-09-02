import { Inject, Injectable, Logger } from '@nestjs/common';
import { BroadcastLogQueue, TransportQueue } from '@rsconnect/queue';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  QueueBroadcastLog,
  Session,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import axios from 'axios';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';
@Injectable()
export class EchoWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_ECHO;
  private readonly logger = new Logger(EchoWorker.name);

  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    override readonly transportQueue: TransportQueue,
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
    const addr = broadcastJob.address.split('|');

    console.log(broadcastJob.address);
    if (!isNaN(+addr[1])) {
      if (+broadcastJob.attempt < +addr[1])
        broadcastLog.status = BroadcastStatus.FAIL;
    }
    if (broadcastLog.status === BroadcastStatus.SUCCESS) {
      try {
        if (
          session.Transport?.config['slack_url'] &&
          session.Transport?.config['slack_email']
        ) {
          const { data } = await axios.post(
            session.Transport.config['slack_url'],
            {
              email: session.Transport.config['slack_email'],
              message: `${addr[0]} -- ${session.message['content']}`,
            },
          );
          broadcastLog.details = { response: data };
        }
      } catch (e) {
        console.log(e);
        broadcastLog.status = BroadcastStatus.FAIL;
      }
    }

    //send log to connect server
    await this.broadcastLogQueue.add(broadcastLog);

    //remove job from batchManager
    await this.batchManager.endMonitoring(broadcastJob.broadcastLogId);

    return broadcastLog;
  }

  async makeTransportReady(sessionCuid: string): Promise<boolean> {
    return true;
  }
}
