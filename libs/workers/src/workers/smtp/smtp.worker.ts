import { Inject, Injectable, Logger } from '@nestjs/common';
import { BroadcastLogQueue, TransportQueue } from '@rsconnect/queue';
import { SmtpTransport } from '@rsconnect/transports/smtp/smtp.transport';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastLog,
  Session,
  TransportSmtpConfig,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';

@Injectable()
export class SmtpWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_SMTP;

  private readonly logger = new Logger(SmtpWorker.name);

  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    override readonly transportQueue: TransportQueue,
    private readonly transport: SmtpTransport,
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
    const { session, broadcastLog, broadcastJob } = data;

    try {
      this.transport.init(session.Transport?.config as TransportSmtpConfig);
      const res = await this.transport.send(
        broadcastJob.address,
        session.message as EmailMessage,
      );

      broadcastLog.status = BroadcastStatus.SUCCESS;
      broadcastLog.details = { messageId: res.messageId };
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

  async makeTransportReady(sessionCuid: string): Promise<boolean> {
    //TODO: Ping smtp to check if it is ready
    return true;
  }
}
