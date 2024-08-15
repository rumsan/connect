import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  Broadcast,
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

  async process(data: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    const { session, broadcast, broadcastLog, jobData } = data;
    const addr = jobData.address.split('|');

    if (!isNaN(+addr[1])) {
      if (+jobData.attempt + 1 < +addr[1])
        broadcastLog.status = BroadcastStatus.FAIL;
    }
    if (broadcastLog.status === BroadcastStatus.SUCCESS) {
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
        broadcastLog.status = BroadcastStatus.FAIL;
      }
    }
    return broadcastLog;
  }
}
