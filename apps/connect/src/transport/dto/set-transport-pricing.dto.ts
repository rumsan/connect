import { ApiProperty } from '@nestjs/swagger';
import { CreditUnitType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetTransportPricingDto {
  @ApiProperty({ example: 0.01 })
  @IsNumber()
  @Min(0)
  creditPerUnit: number;

  @ApiProperty({ enum: CreditUnitType, example: 'MESSAGE' })
  @IsEnum(CreditUnitType)
  unitType: CreditUnitType;

  @ApiProperty({ required: false, default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
