import { PartialType, PickType } from '@nestjs/swagger';
import { CreateTransportDto } from './create-transport.dto';

export class UpdateTransportDto extends PartialType(
  PickType(CreateTransportDto, ['name', 'config'])
) {}
