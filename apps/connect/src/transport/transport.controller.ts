import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { TransportService } from './transport.service';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { ApiTags } from '@nestjs/swagger';

import { validate } from 'class-validator';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { TransportSMTPConfigDto } from './dto/smtp-transport-config.dto';
import { TransportType } from '@rsconnect/sdk/types';

@Controller('transports')
@ApiTags('Transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  async create(@Body() dto: CreateTransportDto) {
    // console.log(dto);

    if (dto.type === TransportType.SMTP)
      await this.validateTransportConfig<TransportSMTPConfigDto>(
        dto.config,
        TransportSMTPConfigDto
      );
    return this.transportService.create(dto);
  }

  @Get()
  findAll() {
    return this.transportService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transportService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTransportDto: UpdateTransportDto
  ) {
    return this.transportService.update(+id, updateTransportDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transportService.remove(+id);
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
