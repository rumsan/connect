import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
} from '@rsconnect/sdk/types';
import axios from 'axios';
import { TransportWorker } from '../transport.worker';
@Injectable()
export class EchoWorker extends TransportWorker {
  TransportQueue: QUEUES = QUEUES.TRANSPORT_ECHO;
  private readonly logger = new Logger(EchoWorker.name);

  async process(
    session: Session,
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog> {
    const addr = data.address.split('|');
    let status = BroadcastStatus.SUCCESS;

    if (!isNaN(+addr[1])) {
      if (+data.attempt + 1 < +addr[1]) status = BroadcastStatus.FAIL;
    }
    if (status === BroadcastStatus.SUCCESS) {
      try {
        if (
          session.Transport?.config['slack_url'] &&
          session.Transport?.config['slack_email']
        )
          await axios.post(session.Transport.config['slack_url'], {
            email: session.Transport.config['slack_email'],
            message: `${addr[0]} -- ${session.message['content']}`,
          });
      } catch (e) {
        console.log(e);
        status = BroadcastStatus.FAIL;
      }
    }
    return {
      broadcast: data.broadcastId,
      attempt: +data.attempt + 1,
      status,
      queue: this.TransportQueue,
    };
  }
}
