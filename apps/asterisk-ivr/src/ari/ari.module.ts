import { Module } from '@nestjs/common';
import { EventService } from './event.service';
import { IncomingAudio } from './audio.incoming';

@Module({
  imports: [],
  providers: [EventService, IncomingAudio],
})
export class AriModule {}
