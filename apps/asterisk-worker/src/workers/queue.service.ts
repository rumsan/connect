// write a nestjs service class named QueueHelper

import { Inject, Injectable } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  QueueBroadcastLog,
  QueueBroadcastVoiceLog,
} from '@rsconnect/sdk/types';
import { ChannelWrapper } from 'amqp-connection-manager';

@Injectable()
export class QueueService {
  constructor(
    @Inject('AMQP_CONNECTION')
    private readonly channel: ChannelWrapper
  ) {
    console.log('QueueHelper instantiated');
  }

  async addLog(data: QueueBroadcastVoiceLog) {
    const test = data as QueueBroadcastLog;
    console.log(test);
    // try {
    //   await this.channel.sendToQueue(
    //     QUEUES.LOG_TRANSPORT,
    //     Buffer.from(JSON.stringify(data)),
    //     {
    //       persistent: true,
    //     }
    //   );
    // } catch (error) {
    //   console.log(error);
    // }
  }
}

//   addToLogQueue<T>(data: T) {
//     return this.channel.sendToQueue(
//       QUEUES.LOG_TRANSPORT,
//       Buffer.from(JSON.stringify({ action: 'update', data })),
//       {
//         persistent: true,
//       }
//     );
//   }
