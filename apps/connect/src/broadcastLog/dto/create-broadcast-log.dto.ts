import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { BroadcastStatus } from '@rsconnect/sdk/types';

export class CreateBroadcastLogDto {
  @ApiProperty({ description: 'Broadcast ID' })
  @IsNotEmpty()
  @IsString()
  broadcastCuid: string;

  @ApiProperty({ description: 'Broadcast status' })
  @IsNotEmpty()
  @IsEnum(BroadcastStatus)
  status: BroadcastStatus;
  @ApiProperty({ description: 'Attempt number' })
  @IsNotEmpty()
  @IsNumber()
  attempt: number;

  @ApiProperty({ description: 'Details of the broadcast log' })
  @IsOptional()
  details?: Record<string, any>;

  @ApiProperty({ description: 'Notes for the broadcast log' })
  @IsOptional()
  notes?: string;
}
