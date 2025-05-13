import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { ListBroadcastDto } from '../broadcast/dto/broadcast.dto';
import { ListBroadcastLogDto } from '../broadcastLog/dto/list-broadcast-log.dto';
import { ListSessionDto } from './dto/list-session.dto';
import { SessionService } from './session.service';

@Controller('sessions')
@ApiTags('Sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) { }

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
    @Query() dto: ListBroadcastLogDto,
  ) {
    return this.sessionService.listLogs(sessionId, dto);
  }

  @Get(':cuid/trigger')
  @ApiOperation({
    summary: 'Trigger a broadcast to retry',
  })
  triggerBroadcast(
    @Param('cuid') cuid: string,
    @Query() dto: { include_failed?: boolean },
  ) {
    return this.sessionService.triggerBroadcast(cuid, dto.include_failed);
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Get the sum of addresses for multiple sessions',
  })
  async getSumOfAddresses(@Body('sessions') sessions: string[]) {
    if (!Array.isArray(sessions)) {
      throw new Error('sessionCuids must be an array of strings');
    }
    return this.sessionService.getSumOfAddresses(sessions);
  }
}
