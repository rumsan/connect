import { IsBoolean, IsIn } from 'class-validator';
import { PaginationDto } from '../../utils/pagination.dto';

export class ListTransportDto extends PaginationDto {
  @IsIn(['createdAt'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';

  @IsBoolean()
  includeDeleted?: boolean = false;
}
