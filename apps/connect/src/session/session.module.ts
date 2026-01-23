import { Module } from '@nestjs/common';
import { BroadcastService } from '../broadcast/broadcast.service';
import { TemplateModule } from '../template/template.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [TemplateModule],
  controllers: [SessionController],
  providers: [SessionService, BroadcastService],
})
export class SessionModule {}
