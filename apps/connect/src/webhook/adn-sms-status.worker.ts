import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdnSmsStatusService } from './adn-sms-status.service';

// ADN SMS has no delivery callback, so we poll its sms-status API on a schedule
// to finalize still-pending broadcasts. Runs every minute; the same work can be
// triggered on demand via POST /webhook/adn-sms-status.
@Injectable()
export class AdnSmsStatusWorker {
  private readonly logger = new Logger(AdnSmsStatusWorker.name);
  private isRunning = false;

  constructor(private readonly adnSmsStatusService: AdnSmsStatusService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'adn-sms-status-poll' })
  async pollAdnSmsStatus() {
    // Opt-out switch — no redeploy needed to pause polling.
    if (process.env['ADN_SMS_POLL_ENABLED'] === 'false') return;

    // A single instance at a time: if a slow poll outruns the minute tick, skip
    // this one rather than stacking overlapping runs.
    if (this.isRunning) {
      this.logger.warn('ADN status poll still running — skipping this tick');
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.adnSmsStatusService.poll({
        limit: Number(process.env['ADN_SMS_POLL_LIMIT']) || 500,
      });

      // Stay quiet on idle ticks (no ADN transports / nothing pending) so the
      // logs aren't flooded once a minute.
      const transports = (result as { transports?: Array<{ scanned: number }> })
        .transports;
      if (transports?.some((t) => t.scanned > 0)) {
        this.logger.log(`ADN status poll: ${JSON.stringify(transports)}`);
      }
    } catch (err: any) {
      this.logger.error(`ADN status poll failed: ${err?.message ?? err}`);
    } finally {
      this.isRunning = false;
    }
  }
}
