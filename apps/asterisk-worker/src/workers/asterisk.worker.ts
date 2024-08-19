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
import { AudioHelper } from '../helpers/audio.helper';
import { PBXHelper } from '../helpers/pbx.helper';
import { wait } from '../utils';

const sftpConfig = {
  host: process.env.ASTERISK_HOST,
  port: Number(process.env.ASTERISK_SSH_PORT),
  username: process.env.ASTERISK_SSH_USER,
  password: process.env.ASTERISK_SSH_PASS,
  audioPath: process.env.ASTERISK_AUDIO_PATH,
};

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
    private readonly audioHelper: AudioHelper,
    override readonly transportQueue: TransportQueue,
    private readonly broadcastLogQueue: BroadcastLogQueue,
    override readonly batchManager: BatchManger,
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
      const cacheSession = await this.sessionCache.findOne({
        where: { cuid: session.cuid },
      });

      if (!cacheSession) {
        await this.sessionCache.create({
          cuid: session.cuid,
          hasAudio: true,
        });
      }

      const pbxHelper = new PBXHelper(
        this.batchManager,
        this.broadcastLogQueue,
      );
      setTimeout(async () => {
        await pbxHelper.broadcastAudio(broadcast, broadcastLog);
      }, 1000);
    } catch (e: any) {
      console.log(e);
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }
    return broadcastLog;
  }

  async makeTransportReady(session: Session) {
    try {
      const rawFile = `.data/${session.cuid}-raw.wav`;
      const convertedFile = `.data/${session.cuid}.wav`;
      const asteriskFile = `${sftpConfig.audioPath}/${session.cuid}.wav`;

      // download file from message.content
      await this.audioHelper.downloadFile(session.message.content, rawFile);

      //convert file bitrate using ffmpeg
      await this.audioHelper.convertAudio(rawFile, convertedFile);

      // upload file to asterisk server
      await this.audioHelper.uploadFileToRemote(
        convertedFile,
        asteriskFile,
        sftpConfig,
      );

      // delete local files
      await this.audioHelper.removeFiles([rawFile, convertedFile]);
      await wait(1500);
      return true;
    } catch (e: any) {
      this.logger.error(e.message);
      return false;
    }
  }
}
