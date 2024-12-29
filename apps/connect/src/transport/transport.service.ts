import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Transport } from '@prisma/client';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateTransportDto } from './dto/create-transport.dto';
import { ListTransportDto } from './dto/list-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}
  create(appId: string, dto: CreateTransportDto) {
    return this.prisma.transport.create({
      data: { cuid: createId(), ...{ app: appId }, ...dto },
    });
  }

  findAll(
    appId: string,
    dto: ListTransportDto,
  ): Promise<PaginatorTypes.PaginatedResult<Transport>> {
    const where = {
      app: appId,
      deletedAt: null,
    };
    if (dto.includeDeleted) {
      delete where.deletedAt;
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.transport,
      {
        where,
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.perPage,
      },
    );
  }

  findOne(cuid: string) {
    return this.prisma.transport.findUnique({
      where: {
        cuid,
      },
    });
  }

  update(cuid: string, dto: UpdateTransportDto) {
    return this.prisma.transport.update({
      where: { cuid },
      data: dto,
    });
  }

  remove(cuid: string) {
    return this.prisma.transport.update({
      where: { cuid },
      data: { config: null, deletedAt: new Date() },
    });
  }
}
