import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  TWILIO_BATCHING_BROADCAST_PORT,
  TwilioBatchingBroadcastPort,
} from './twilio-batching.types';
import { TwilioBatchingService } from './twilio-batching.service';

@Injectable()
export class TwilioBatchingWorker {
  private readonly logger = new Logger(TwilioBatchingWorker.name);

  constructor(
    private readonly twilioBatchingService: TwilioBatchingService,
    @Inject(TWILIO_BATCHING_BROADCAST_PORT)
    private readonly broadcastPort: TwilioBatchingBroadcastPort,
  ) {}

  @Cron('0 0 * * * *')
  async processDueTwilioBatches() {
    const due = await this.twilioBatchingService.findDueSessionsAndReset(
      new Date(),
    );

    for (const item of due) {
      this.logger.log(
        `Twilio: starting next daily batch for session ${item.sessionCuid} (${item.scheduledCount} remaining)`,
      );

      this.broadcastPort.checkTransportReadiness(
        item.sessionCuid,
        item.transportType,
      );
    }
  }
}
