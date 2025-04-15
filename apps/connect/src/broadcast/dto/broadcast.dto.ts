import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { BroadcastStatus, TriggerType } from '@rumsan/connect';
import { PaginationDto } from '../../utils/pagination.dto';

export class MessageDto {
  @ApiProperty({ description: 'Message content', example: 'Hello World' })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty({ description: 'Meta data for the message' })
  @IsOptional()
  meta?: Record<string, any>;
}

export class BroadcastOptionsDto {
  @ApiProperty({
    description: 'Timestamp for scheduled message',
    example: '2021-09-01T00:00:00Z',
  })
  @IsOptional()
  @IsDate()
  scheduledTimestamp?: Date;

  @ApiProperty({
    description: 'Interval between attempts in minutes',
    example: '5',
  })
  @IsOptional()
  attemptIntervalMinutes?: string;
}

export class BroadcastDto {
  @ApiProperty({ description: 'Transport', example: '' })
  @IsNotEmpty()
  @IsString()
  transport: string;

  @ApiProperty({ description: 'Message content' })
  @IsNotEmpty()
  message: MessageDto;

  @ApiProperty({
    description: 'List of addresses to send the message to',
    example: [''],
  })
  @IsNotEmpty()
  @IsString({ each: true })
  addresses: string[];

  @ApiProperty({
    description: 'Maximum number of attempts to send the message',
    example: 3,
  })
  @IsOptional()
  maxAttempts?: number;

  @ApiProperty({ description: 'Trigger type', example: TriggerType.IMMEDIATE })
  @IsNotEmpty()
  @IsEnum(TriggerType)
  trigger: TriggerType;

  @ApiProperty({ description: 'Webhook url', example: '' })
  @IsOptional()
  webhook?: string;

  @ApiProperty({ description: 'Options for scheduled message' })
  @IsOptional()
  options?: BroadcastOptionsDto;

  @ApiProperty({ description: 'Reference identifier for end user app' })
  @IsOptional()
  @IsString()
  xref?: string;
}

export class ListBroadcastDto extends PaginationDto {
  @IsIn(['createdAt'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';

  @ApiProperty({
    example: 'SUCCESS',
    description: 'Filter by status (SUCCESS, PENDING, FAILED)',
    required: false,
  })
  @IsOptional()
  @IsEnum(BroadcastStatus, {
    message: 'status must be one of PENDING,SCHEDULED, SUCCESS, or FAILED',
  })
  status?: BroadcastStatus;

  @ApiProperty({
    example: '2024-12-24',
    description: 'Start date for filtering',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    example: '2024-12-31',
    description: 'End date for filtering',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    example: 'projectId-reference',
    description: 'ProjectId Reference',
    required: false,
  })
  @IsOptional()
  xref?: string;
}
