import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUES } from '@rumsan/connect';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { TemplateModule } from '../template/template.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUES.SCHEDULED,
    }),
    BroadcastModule,
    TemplateModule
  ],
  controllers: [SessionController],
  providers: [
    SessionService,
  ],
})
export class SessionModule {}
