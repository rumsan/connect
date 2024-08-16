import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import {
  Broadcast,
  BroadcastStatus,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
} from '@rumsan/connect/types';
import { IDataProvider, TransportWorker } from '@rsconnect/workers';
import { ChannelWrapper } from 'amqp-connection-manager';
import { AudioHelper } from '../helpers/audio.helper';
import { PBXHelper } from '../helpers/pbx.helper';
import { InjectModel } from '@nestjs/sequelize';
import { SessionModel } from '../entities/session.entity';
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
  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    @InjectModel(SessionModel)
    private sessionCache: typeof SessionModel,
    private readonly audioHelper: AudioHelper,
    private readonly pbxHelper: PBXHelper,
  ) {
    super(dataProvider, channel);
  }
  TransportQueue: QUEUES = QUEUES.TRANSPORT_VOICE;
  private readonly logger = new Logger(AsteriskWorker.name);

  async sendBroadcast(data: {
    session: Session;
    broadcast: Broadcast;
    jobData: QueueBroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<{ sendLog: boolean; log: QueueBroadcastLog }> {
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

      await this.pbxHelper.broadcastAudio(broadcast, broadcastLog);
    } catch (e: any) {
      console.log(e);
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message };
    }
    return { sendLog: false, log: broadcastLog };
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
