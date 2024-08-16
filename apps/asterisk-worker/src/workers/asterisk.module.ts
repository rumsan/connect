import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DataProviderModule } from '@rsconnect/workers';
import { SessionModel } from '../entities/session.entity';
import { AudioHelper } from '../helpers/audio.helper';
import { PBXHelper } from '../helpers/pbx.helper';
import { AMIService } from './ami.service';
import { AsteriskWorker } from './asterisk.worker';
import { QueueService } from './queue.service';

@Module({
  imports: [SequelizeModule.forFeature([SessionModel]), DataProviderModule],
  providers: [AsteriskWorker, AudioHelper, PBXHelper, AMIService, QueueService],
  exports: [AsteriskWorker, AMIService, QueueService],
})
export class AsteriskWorkerModule {}
