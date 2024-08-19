import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BatchManger } from '@rsconnect/queue';
import { DataProviderModule } from '@rsconnect/workers';
import { SessionModel } from '../entities/session.entity';
import { AudioHelper } from '../helpers/audio.helper';
import { AMIService } from './ami.service';
import { AsteriskWorker } from './asterisk.worker';

@Module({
  imports: [SequelizeModule.forFeature([SessionModel]), DataProviderModule],
  providers: [AsteriskWorker, AudioHelper, AMIService, BatchManger],
  exports: [AsteriskWorker, AMIService],
})
export class AsteriskWorkerModule {}
