import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  BatchManger,
  BroadcastLogQueue,
  TransportQueue,
} from '@rsconnect/queue';
import { IDataProvider, TransportWorker } from '@rsconnect/workers';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastJobData,
  BroadcastStatus,
  QueueBroadcastLog,
  Session,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { SessionModel } from '../entities/session.entity';
import { wait } from '../utils';
import { AudioService } from './audio.service';
import { PbxService } from './pbx.service';

@Injectable()
export class AsteriskWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_VOICE;
  private readonly logger = new Logger(AsteriskWorker.name);

  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    @InjectModel(SessionModel)
    private sessionCache: typeof SessionModel,
    private readonly audioService: AudioService,
    override readonly transportQueue: TransportQueue,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    override readonly batchManager: BatchManger,
    private readonly pbxService: PbxService,
  ) {
    super(dataProvider, channel, transportQueue);
  }

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    const { session, broadcast, broadcastLog } = data;
    broadcastLog.status = BroadcastStatus.PENDING;

    try {
      await this.pbxService.sendBroadcast(broadcast, broadcastLog);
    } catch (e: any) {
      console.log(e);
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }
    return broadcastLog;
  }

  async makeTransportReady(session: Session) {
    try {
      //return true;
      const cacheSession = await this.sessionCache.findOne({
        where: { cuid: session.cuid },
      });

      if (!cacheSession) {
        await this.sessionCache.create({
          cuid: session.cuid,
          hasAudio: true,
        });
      }

      //console.log(cacheSession);

      await this.audioService.makeAudioReady(session);

      await wait(1500);
      return true;
    } catch (e: any) {
      this.logger.error(e.message);
      return false;
    }
  }
}
