import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { BroadcastService } from './broadcast.service';
import { BroadcastDto, ListBroadcastDto } from './dto/broadcast.dto';
import { ListBroadcastLogDto } from '../broadcastLog/dto/list-broadcast-log.dto';

@Controller('broadcasts')
@ApiTags('Broadcasts')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new broadcast',
  })
  create(@AppId() appId: string, @Body() dto: BroadcastDto) {
    return this.broadcastService.create(appId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all broadcasts for the registered app',
  })
  findAll(@AppId() appId: string, @Query() dto: ListBroadcastDto) {
    return this.broadcastService.findAll(appId, dto);
  }

  @Get('status-count')
  getStatusCount(@AppId() appId: string) {
    return this.broadcastService.broadcastStatusCount(appId);
  }

  @Post('list-selected')
  @ApiOperation({
    summary: 'List selected broadcasts based on cuids',
  })
  listSelected(@AppId() appId: string, @Body() broadcastIds: string[]) {
    return this.broadcastService.findSelected(appId, broadcastIds);
  }

  @Get(':cuid')
  @ApiOperation({
    summary: 'Get a broadcast details with logs by broadcast id',
  })
  findOne(@Param('cuid') cuid: string) {
    return this.broadcastService.findOne(cuid);
  }

   @Get(":xref/logs")
    @ApiOperation({
      summary: 'Get all logged items for the registered app.',
    })
    getProjectLogs(@AppId() appId: string, @Query() dto: ListBroadcastLogDto, @Param("xref") xref: string) {
      return this.broadcastService.getProjectsLogs(appId, dto, xref);
   }
  
   @Get(":xref/reports")
    @ApiOperation({
      summary: 'Get all logged items for the registered app.',
    })
    getProjectReports(@AppId() appId: string, @Query() dto: ListBroadcastLogDto, @Param("xref") xref: string) {
      return this.broadcastService.getProjectsReports(appId, dto, xref);
    }
}
