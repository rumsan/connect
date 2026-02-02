import { IsEnum, IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';
import { TemplateStatus, TemplateType } from '@prisma/client';
import { PaginationDto } from '../../utils/pagination.dto';

export class ListTemplateDto extends PaginationDto {
  @IsIn(['createdAt', 'name', 'status'])
  override sort: string = 'createdAt';

  override order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  transportId?: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
