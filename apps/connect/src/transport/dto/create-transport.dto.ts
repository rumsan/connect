import { ApiProperty } from '@nestjs/swagger';
import { TransportType, ValidationContent, ValidationAddress } from '@rumsan/connect/types';
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
    description: 'Content validation type',
    enum: ValidationContent,
    required: false,
    example: ValidationContent.URL,
  })
  @IsOptional()
  @IsEnum(ValidationContent)
  validationContent?: ValidationContent;

  @ApiProperty({
    description: 'Address validation type',
    enum: ValidationAddress,
    required: false,
    example: ValidationAddress.PHONE,
  })
  @IsOptional()
  @IsEnum(ValidationAddress)
  validationAddress?: ValidationAddress;

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
