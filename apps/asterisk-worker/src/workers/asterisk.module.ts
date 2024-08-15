import { Module } from '@nestjs/common';
import { ApiProvider } from '@rsconnect/workers';
import { AsteriskWorker } from './asterisk.worker';
import { AudioHelper } from '../helpers/audio.helper';
import { PBXHelper } from '../helpers/pbx.helper';
import { AMIService } from './ami.service';
import { QueueService } from './queue.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { SessionModel } from '../entities/session.entity';

@Module({
  imports: [SequelizeModule.forFeature([SessionModel])],
  providers: [
    ApiProvider,
    AsteriskWorker,
    AudioHelper,
    PBXHelper,
    AMIService,
    QueueService,
  ],
  exports: [AsteriskWorker, AMIService, QueueService],
})
export class AsteriskWorkerModule {}
