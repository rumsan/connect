import { InjectQueue } from '@nestjs/bull';
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bull';
import { UsageService } from './usage.service';
import {
  USAGE_BACKFILL_JOB,
  USAGE_BACKFILL_QUEUE,
} from './usage.backfill.worker';

@Controller('usage')
@ApiTags('Usage')
export class UsageController {
  constructor(
    private readonly usageService: UsageService,
    @InjectQueue(USAGE_BACKFILL_QUEUE)
    private readonly backfillQueue: Queue,
  ) {}

  @Get(':appId')
  @ApiOperation({ summary: 'Get usage summary for an app' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getUsage(
    @Param('appId') appId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usageService.getUsage(appId, '', from, to);
  }

  @Get(':appId/xref/:xref')
  @ApiOperation({ summary: 'Get usage summary for an app and xref' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getUsageByXref(
    @Param('appId') appId: string,
    @Param('xref') xref: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usageService.getUsage(appId, xref, from, to);
  }

  @Get(':appId/credits')
  @ApiOperation({ summary: 'Get credits consumed by an app' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getCredits(
    @Param('appId') appId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usageService.getCredits(appId, '', from, to);
  }

  @Get(':appId/xref/:xref/credits')
  @ApiOperation({ summary: 'Get credits consumed by an app and xref' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getCreditsByXref(
    @Param('appId') appId: string,
    @Param('xref') xref: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usageService.getCredits(appId, xref, from, to);
  }

  @Post('backfill')
  @ApiOperation({ summary: 'Enqueue backfill of usage snapshots from historical completed sessions' })
  @ApiQuery({ name: 'batchSize', required: false, example: 100 })
  @ApiQuery({ name: 'concurrency', required: false, example: 5 })
  async backfill(
    @Query('batchSize') batchSize?: string,
    @Query('concurrency') concurrency?: string,
  ) {
    const job = await this.backfillQueue.add(
      USAGE_BACKFILL_JOB,
      {
        batchSize: batchSize ? parseInt(batchSize, 10) : 100,
        concurrency: concurrency ? parseInt(concurrency, 10) : 5,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return {
      message: 'Backfill job enqueued',
      jobId: job.id,
    };
  }
}
