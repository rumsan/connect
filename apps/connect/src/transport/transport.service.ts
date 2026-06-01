import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Transport } from '@prisma/client';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateTransportDto } from './dto/create-transport.dto';
import { ListTransportDto } from './dto/list-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';


const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  constructor(private readonly prisma: PrismaService) { }
  async create(appId: string, dto: CreateTransportDto) {
    this.logger.log(`Creating transport for app ${appId}`);
    this.logger.debug(`Transport details: name=${dto.name}, type=${dto.type}`);
    const transport = await this.prisma.transport.create({
      data: { cuid: createId(), ...{ app: appId }, ...dto },
    });
    this.logger.debug(`Transport created with cuid: ${transport.cuid}`);
    return transport;
  }

  findAll(
    appId: string,
    dto: ListTransportDto,
  ): Promise<PaginatorTypes.PaginatedResult<Transport>> {
    this.logger.log(`Listing transports for app ${appId}`);
    this.logger.debug(`Listing with filters: includeDeleted=${dto.includeDeleted}, sort=${dto.sort}, order=${dto.order}`);
    if (!appId) {
      throw new Error('App ID is required to list transports');
    }
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

  async findOne(cuid: string) {
    this.logger.log(`Finding transport with cuid: ${cuid}`);
    const transport = await this.prisma.transport.findUnique({
      where: {
        cuid,
      },
    });
    if (!transport) {
      this.logger.debug(`Transport not found for cuid: ${cuid}`);
    }
    return transport;
  }

  async update(cuid: string, dto: UpdateTransportDto) {
    this.logger.log(`Updating transport with cuid: ${cuid}`);
    const transport = await this.prisma.transport.update({
      where: { cuid },
      data: dto,
    });
    this.logger.debug(`Transport updated successfully`);
    return transport;
  }

  async remove(cuid: string) {
    this.logger.log(`Removing transport with cuid: ${cuid}`);
    const transport = await this.prisma.transport.update({
      where: { cuid },
      data: { config: null, deletedAt: new Date() },
    });
    this.logger.debug(`Transport removed successfully`);
    return transport;
  }
}
