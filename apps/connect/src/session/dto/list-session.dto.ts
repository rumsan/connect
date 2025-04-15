import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional
} from 'class-validator';
import { PaginationDto } from '../../utils/pagination.dto';



export class ListSessionDto extends PaginationDto {
  @IsIn(['createdAt'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';

  @ApiProperty({
    example: 'projectId-reference',
    description: 'ProjectId Reference',
    required: false,
  })
  @IsOptional()
  xref?: string;
}

