import { ApiProperty } from '@nestjs/swagger';
import { TransportType } from '@rsconnect/sdk/types';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
}
