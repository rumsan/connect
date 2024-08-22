import {
  BadRequestException,
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
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { TransportService } from './transport.service';

import { TransportType } from '@rumsan/connect/types';
import { AppId } from '@rumsan/app';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTransportDto } from './dto/list-transport.dto';
import { TransportSMTPConfigDto } from './dto/smtp-transport-config.dto';

@Controller('transports')
@ApiTags('Transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) { }

  @Post()
  @ApiOperation({
    summary: 'Create a new transport. Valid types: SMTP,API,SES,ECHO,VOICE',
  })
  async create(@AppId() appId: string, @Body() dto: CreateTransportDto) {
    if (dto.type === TransportType.SMTP)
      await this.validateTransportConfig<TransportSMTPConfigDto>(
        dto.config,
        TransportSMTPConfigDto
      );
    return this.transportService.create(appId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all transports for the app',
  })
  findAll(@AppId() appId: string, @Query() dto: ListTransportDto) {
    return this.transportService.findAll(appId, dto);
  }

  @Get(':cuid')
  @ApiOperation({
    summary: 'Get a transport by transport id',
  })
  findOne(@Param('cuid') cuid: string) {
    return this.transportService.findOne(cuid);
  }

  @Patch(':cuid')
  @ApiOperation({
    summary: 'Update a transport by transport id',
  })
  update(
    @Param('cuid') cuid: string,
    @Body() updateTransportDto: UpdateTransportDto
  ) {
    return this.transportService.update(cuid, updateTransportDto);
  }

  @Delete(':cuid')
  @ApiOperation({
    summary: 'Remove a transport by transport id',
  })
  remove(@Param('cuid') cuid: string) {
    return this.transportService.remove(cuid);
  }

  async validateTransportConfig<T extends object>(
    config: Record<string, any>,
    dto: ClassConstructor<T>
  ) {
    const emailConfig = plainToInstance(dto, config);

    const errors = await validate(emailConfig);

    if (errors.length > 0) {
      const errorMessages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {})
      );
      throw new BadRequestException(errorMessages);
    }
  }
}
