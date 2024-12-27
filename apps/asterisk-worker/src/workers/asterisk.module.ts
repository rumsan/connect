import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BatchManger } from '@rsconnect/queue';
import { DataProviderModule } from '@rsconnect/workers';
import { IvrModel } from '../entities/ivr.entity';
import { SessionModel } from '../entities/session.entity';
import { AMIService } from './ami.service';
import { AsteriskWorker } from './asterisk.worker';
import { AudioService } from './audio.service';
import { IVRService } from './ivr.service';
import { PbxService } from './pbx.service';

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
    IVRService,
    PbxService,
  ],
  exports: [AsteriskWorker, AMIService],
})
export class AsteriskWorkerModule {}
