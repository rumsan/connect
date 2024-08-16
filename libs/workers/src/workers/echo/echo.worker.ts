import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
} from '@rumsan/connect/types';
import axios from 'axios';
import { TransportWorker } from '../transport.worker';
@Injectable()
export class EchoWorker extends TransportWorker {
  TransportQueue: QUEUES = QUEUES.TRANSPORT_ECHO;
  private readonly logger = new Logger(EchoWorker.name);

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<{ sendLog: boolean; log: QueueBroadcastLog }> {
    const { session, broadcast, broadcastLog, jobData } = data;
    const addr = jobData.address.split('|');

    if (!isNaN(+addr[1])) {
      if (+jobData.attempt < +addr[1])
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
    return { sendLog: true, log: broadcastLog };
  }

  override async makeTransportReady(session: Session): Promise<boolean> {
    return true;
  }
}
