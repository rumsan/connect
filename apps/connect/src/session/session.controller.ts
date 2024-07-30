import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { ListBroadcastDto } from '../broadcast/dto/broadcast.dto';
import { ListBroadcastLogDto } from '../broadcastLog/dto/list-broadcast-log.dto';
import { ListSessionDto } from './dto/list-session.dto';
import { SessionService } from './session.service';

@Controller('sessions')
@ApiTags('Sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all sessions for the app',
  })
  findAll(@AppId() appId: string, @Query() dto: ListSessionDto) {
    return this.sessionService.findAll(appId, dto);
  }

  @Get(':cuid')
  @ApiOperation({
    summary: 'Get a session by session id',
  })
  findOne(@Param('cuid') cuid: string) {
    return this.sessionService.findOne(cuid);
  }

  @Get(':cuid/broadcasts')
  @ApiOperation({
    summary: 'Get all broadcasted messages for a session',
  })
  listBroadcasts(@Param('cuid') cuid: string, @Query() dto: ListBroadcastDto) {
    return this.sessionService.listBroadcasts(cuid, dto);
  }

  @Get(':cuid/logs')
  @ApiOperation({
    summary: 'Get all logs for a session',
  })
  listLogs(
    @Param('cuid') sessionId: string,
    @Query() dto: ListBroadcastLogDto
  ) {
    return this.sessionService.listLogs(sessionId, dto);
  }
}
