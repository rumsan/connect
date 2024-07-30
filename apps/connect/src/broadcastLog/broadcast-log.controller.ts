import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { BroadcastLogService } from './broadcast-log.service';
import { CreateBroadcastLogDto } from './dto/create-broadcast-log.dto';

@Controller('broadcast-log')
export class BroadcastLogController {
  constructor(private readonly broadcastLogService: BroadcastLogService) {}

  @Post()
  create(@Body() createBroadcastLogDto: CreateBroadcastLogDto) {
    return this.broadcastLogService.createUsingDto(createBroadcastLogDto);
  }

  @Get()
  findAll() {
    return this.broadcastLogService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.broadcastLogService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.broadcastLogService.remove(+id);
  }
}
