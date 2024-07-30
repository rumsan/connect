import { Injectable } from '@nestjs/common';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { PrismaService } from '@rumsan/prisma';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}
  create(dto: CreateTransportDto) {
    return this.prisma.transport.create({
      data: { cuid: createId(), ...dto },
    });
  }

  findAll() {
    return `This action returns all transport`;
  }

  findOne(id: number) {
    return `This action returns a #${id} transport`;
  }

  update(id: number, updateTransportDto: UpdateTransportDto) {
    return `This action updates a #${id} transport`;
  }

  remove(id: number) {
    return `This action removes a #${id} transport`;
  }
}
