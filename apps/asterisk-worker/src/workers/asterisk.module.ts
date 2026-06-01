import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BatchManger } from '@rsconnect/queue';
import { DataProviderModule } from '@rsconnect/workers';
import { IvrModel } from '../entities/ivr.entity';
import { SessionModel } from '../entities/session.entity';
import { AMIService } from './ami.service';
import { AsteriskWorker } from './asterisk.worker';
import { AudioService } from './audio.service';
import { ChannelStateManager } from './channel-state.manager';
import { IVRService } from './ivr.service';
import { PlaybackService } from './playback.service';

@Module({
  imports: [
    SequelizeModule.forFeature([SessionModel]),
    SequelizeModule.forFeature([IvrModel]),
    DataProviderModule,
  ],
  providers: [
    AsteriskWorker,
    AudioService,
    AMIService,
    BatchManger,
    ChannelStateManager,
    PlaybackService,
    IVRService,
  ],
  exports: [AsteriskWorker, AMIService],
})
export class AsteriskWorkerModule { }
