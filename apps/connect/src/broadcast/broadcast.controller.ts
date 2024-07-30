import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { BroadcastService } from './broadcast.service';
import { BroadcastDto, ListBroadcastDto } from './dto/broadcast.dto';

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

  @Get(':cuid')
  @ApiOperation({
    summary: 'Get a broadcast details with logs by broadcast id',
  })
  findOne(@Param('cuid') cuid: string) {
    return this.broadcastService.findOne(cuid);
  }
}
