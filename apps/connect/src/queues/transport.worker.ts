import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@rsconnect/sdk';
import {
  QueueBroadcastJob,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
} from '@rsconnect/sdk/types';
import { PrismaService } from '@rumsan/prisma';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

@Injectable()
export abstract class TransportWorker implements OnModuleInit {
  abstract TransportQueue: QUEUES;
  constructor(
    protected readonly prisma: PrismaService,
    @Inject('AMQP_CONNECTION')
    protected readonly channel: ChannelWrapper
  ) {}

  public async onModuleInit() {
    try {
      await this.channel.addSetup(async (channel: ConfirmChannel) => {
        await this.assertQueue(channel);
        await channel.consume(this.TransportQueue, async (message) => {
          if (message) {
            const content: QueueBroadcastJob = JSON.parse(
              message.content.toString()
            );

            const broadcastLog = await this._process(content.data);
            await this.addToLogQueue<QueueBroadcastLog>(broadcastLog);
            channel.ack(message);
          }
        });
      });
    } catch (err) {
      console.error('Error starting the consumer:', err);
    }
  }

  async assertQueue(channel: ConfirmChannel) {
    await channel.assertQueue(QUEUES.LOG_TRANSPORT, { durable: true });
    await channel.assertQueue(this.TransportQueue, { durable: true });
  }

  addToLogQueue<T>(data: T) {
    return this.channel.sendToQueue(
      QUEUES.LOG_TRANSPORT,
      Buffer.from(JSON.stringify(data)),
      {
        persistent: true,
      }
    );
  }

  private async _process(
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog> {
    const session: Session = (await this.prisma.session.findUnique({
      where: {
        cuid: data.sessionId,
      },
      include: {
        Transport: true,
      },
    })) as Session;

    return this.process(session, data);
  }

  abstract process(
    session: Session,
    data: QueueBroadcastJobData
  ): Promise<QueueBroadcastLog>;
}
