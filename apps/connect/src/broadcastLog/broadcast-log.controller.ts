import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { BroadcastLogService } from './broadcast-log.service';
import { ListBroadcastLogDto } from './dto/list-broadcast-log.dto';

@ApiTags('Broadcast Logs')
@Controller('logs')
export class BroadcastLogController {
  constructor(private readonly broadcastLogService: BroadcastLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all logged items for the registered app.',
  })
  findAll(@AppId() appId: string, @Query() dto: ListBroadcastLogDto) {
    return this.broadcastLogService.findAll(appId, dto);
  }
}
