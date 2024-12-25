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
import { IvrModel } from '../entities/ivr.entity';
import { SessionModel } from '../entities/session.entity';

import { wait } from '../utils';
import { AudioService } from './audio.service';
import { IVRService } from './ivr.service';
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
    @InjectModel(IvrModel)
    private ivrCache: typeof IvrModel,
    private readonly audioService: AudioService,
    override readonly transportQueue: TransportQueue,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    override readonly batchManager: BatchManger,
    private readonly ivrService: IVRService,
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
      if (session?.message?.meta?.type === 'new-ivr') {
        const { jsonData } = await this.ivrCache.findOne({
          where: { url: session?.message?.content.split('/').pop() },
        });
        await this.ivrService.sendBroadcast(broadcast, broadcastLog, jsonData);
      } else {
        await this.pbxService.sendBroadcast(broadcast, broadcastLog);
      }
    } catch (e: any) {
      console.log(e);
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }
    return broadcastLog;
  }
  async makeTransportReady(sessionCuid: string) {
    try {
      const session: Session = await this.dataProvider.getSession(sessionCuid);
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

      if (session.message.meta.type === 'new-ivr') {
        const cacheIvr = await this.ivrCache.findOne({
          where: { url: session?.message?.content.split('/').pop() },
        });
        if (!cacheIvr) {
          const { url, preparedData } = await this.audioService.makeJSONReady(
            session,
          );
          await this.ivrCache.create({
            url,
            jsonData: JSON.stringify(preparedData),
          });
        }
      } else {
        await this.audioService.makeAudioReady(session);
      }
      await wait(1500);
      return true;
    } catch (e: any) {
      this.logger.error(e.message);
      return false;
    }
  }
}
