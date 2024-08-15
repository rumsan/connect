import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportSmtpConfig,
} from '@rumsan/connect/types';
import { SmtpTransport } from '@rsconnect/transports/smtp/smtp.transport';
import { ChannelWrapper } from 'amqp-connection-manager';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';

@Injectable()
export class SmtpWorker extends TransportWorker {
  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    private readonly transport: SmtpTransport
  ) {
    super(dataProvider, channel);
  }
  TransportQueue: QUEUES = QUEUES.TRANSPORT_SMTP;
  private readonly logger = new Logger(SmtpWorker.name);

  async process(data: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    const { session, broadcast, broadcastLog, jobData } = data;

    try {
      this.transport.init(session.Transport?.config as TransportSmtpConfig);
      const res = await this.transport.send(
        jobData.address,
        session.message as EmailMessage
      );

      broadcastLog.status = BroadcastStatus.SUCCESS;
      broadcastLog.details = { messageId: res.messageId };
    } catch (e: any) {
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }

    // this.smtpService.send();

    return broadcastLog;
  }
}
