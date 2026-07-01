import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { UsageBackfillService } from './usage.backfill.service';
import {
  UsageBackfillWorker,
  USAGE_BACKFILL_QUEUE,
} from './usage.backfill.worker';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [BullModule.registerQueue({ name: USAGE_BACKFILL_QUEUE })],
  controllers: [UsageController],
  providers: [UsageService, UsageBackfillService, UsageBackfillWorker],
})
export class UsageModule {}
