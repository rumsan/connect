import { OmitType } from '@nestjs/swagger';
import { CreateTransportDto } from './create-transport.dto';

export class UpdateTransportDto extends OmitType(CreateTransportDto, [
  'app',
  'type',
]) {}
