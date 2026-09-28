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
import { ConnectionLifecycleManager } from './connection-lifecycle.manager';
import { LogStreamModule } from '@rsconnect/log-stream';
import { IVRService } from './ivr.service';
import { PlaybackService } from './playback.service';
import { RecordingService } from './recording.service';
import { SessionGate } from './session-gate';
import { StorageService } from './storage.service';

@Module({
  imports: [
    SequelizeModule.forFeature([SessionModel]),
    SequelizeModule.forFeature([IvrModel]),
    DataProviderModule,
    LogStreamModule,
  ],
  providers: [
    AsteriskWorker,
    AudioService,
    AMIService,
    BatchManger,
    ChannelStateManager,
    ConnectionLifecycleManager,
    PlaybackService,
    RecordingService,
    StorageService,
    IVRService,
    SessionGate,
  ],
  exports: [AsteriskWorker, AMIService],
})
export class AsteriskWorkerModule { }
