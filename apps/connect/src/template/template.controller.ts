import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ListTemplateDto } from './dto/list-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateService } from './template.service';

@ApiTags('templates')
@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  create(@AppId() appId: string, @Body() createTemplateDto: CreateTemplateDto) {
    return this.templateService.create(appId, createTemplateDto);
  }

  @Get()
  findAll(@AppId() appId: string, @Query() dto: ListTemplateDto) {
    return this.templateService.findAll(appId, dto);
  }

  @Get(':cuid')
  findOne(@Param('cuid') cuid: string) {
    return this.templateService.findOne(cuid);
  }

  @Patch(':cuid')
  update(
    @Param('cuid') cuid: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templateService.update(cuid, updateTemplateDto);
  }

  @Delete(':cuid')
  remove(@Param('cuid') cuid: string) {
    return this.templateService.remove(cuid);
  }

  @Delete(':cuid/force')
  delete(@Param('cuid') cuid: string) {
    return this.templateService.delete(cuid);
  }

  @Post(':transportId/sync')
  @ApiOperation({
    summary: 'Sync templates from provider',
    description:
      'Manually trigger sync of templates from provider API to database',
  })
  async syncTemplates(@Param('transportId') transportId: string) {
    return this.templateService.sync(transportId);
  }
}
