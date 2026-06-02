import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TwilioBatchingService } from './twilio-batching.service';
import {
  TWILIO_BATCHING_BROADCAST_PORT,
  TwilioBatchingBroadcastPort,
} from './twilio-batching.types';

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

    let dispatched = 0;
    let failed = 0;
    for (let i = 0; i < due.length; i++) {
      const item = due[i];
      this.logger.log(
        `Twilio: starting next daily batch for session ${item.sessionCuid} (${item.scheduledCount} remaining)`,
      );

      try {
        await this.broadcastPort.checkTransportReadiness(
          item.sessionCuid,
          item.transportType,
        );
        dispatched++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Twilio: readiness check publish failed for session ${item.sessionCuid}`,
          err,
        );
      }

      // Pace the publish loop: every 20 sessions, yield briefly so the AMQP
      // confirm channel can drain.
      if ((i + 1) % 20 === 0 && i + 1 < due.length) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    if (due.length > 0) {
      this.logger.log(
        `Twilio batch tick: dispatched=${dispatched} failed=${failed} (of ${due.length} due)`,
      );
    }
  }
}
