import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { BroadcastDto } from './dto/broadcast.dto';
import { ApiTags } from '@nestjs/swagger';

@Controller('broadcast')
@ApiTags('Broadcast')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Post()
  create(@Body() dto: BroadcastDto) {
    return this.broadcastService.create(dto);
  }

  @Post('test')
  createTest(@Body() dto: any) {
    console.log('test---post', dto);
    return {};
  }

  @Get()
  findAll() {
    return this.broadcastService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.broadcastService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.broadcastService.remove(+id);
  }
}
