import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  BroadcastStatus,
  EmailMessage,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportSmtpConfig,
} from '@rsconnect/sdk/types';
import { SmtpTransport } from '@rsconnect/transports/smtp/smtp.transport';
import { ChannelWrapper } from 'amqp-connection-manager';
import { TransportWorker } from '../transport.worker';
import { IDataProvider } from '../../data-providers/data-provider.interface';

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
      this.transport.init(session.Transport?.config as TransportSmtpConfig);
      const res = await this.transport.send(
        data.address,
        session.message as EmailMessage
      );

      logData.status = BroadcastStatus.SUCCESS;
      logData.details = { messageId: res.messageId };
    } catch (e: any) {
      logData.status = BroadcastStatus.FAIL;
      logData.details = { error: e.message };
    }

    // this.smtpService.send();

    return logData;
  }
}
