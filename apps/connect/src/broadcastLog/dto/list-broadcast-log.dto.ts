import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
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
}
