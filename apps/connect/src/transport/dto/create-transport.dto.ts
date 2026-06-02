import { ApiProperty } from '@nestjs/swagger';
import { TransportType } from '@rumsan/connect/types';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { SetTransportPricingDto } from './set-transport-pricing.dto';

export class CreateTransportDto {
  @ApiProperty({ description: 'Transport name', example: 'Email Sender' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Transport type', example: TransportType.ECHO })
  @IsNotEmpty()
  @IsEnum(TransportType)
  type: TransportType;

  @ApiProperty({
    description: 'Transport configuration',
    example: { test: 'hello' },
  })
  @IsNotEmpty()
  config: Record<string, any>;

  @ApiProperty({
    description: 'Optional pricing configuration',
    required: false,
    type: SetTransportPricingDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SetTransportPricingDto)
  pricing?: SetTransportPricingDto;
}
