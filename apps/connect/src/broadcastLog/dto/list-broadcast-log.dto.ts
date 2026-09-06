import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { BroadcastStatus } from '@rumsan/connect/types';
import { PaginationDto } from '../../utils/pagination.dto';

export class ListBroadcastLogDto extends PaginationDto {
  @IsIn(['createdAt'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';

  @ApiProperty({
    example: 'SUCCESS',
    description: 'Filter by status',
    enum: BroadcastStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

  @ApiProperty({
    example: '+1234567890',
    description: 'Search by address (case-insensitive contains)',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    example: '2024-12-24',
    description: 'Start of createdAt range (inclusive)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    example: '2024-12-31',
    description: 'End of createdAt range (inclusive)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
