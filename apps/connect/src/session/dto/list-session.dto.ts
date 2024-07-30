import { PaginationDto } from '../../utils/pagination.dto';
import { IsIn } from 'class-validator';

export class ListSessionDto extends PaginationDto {
  @IsIn(['createdAt'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';
}
