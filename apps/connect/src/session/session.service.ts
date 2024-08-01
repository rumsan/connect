import { Injectable } from '@nestjs/common';
import { BroadcastLog, Session } from '@prisma/client';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { ListBroadcastDto } from '../broadcast/dto/broadcast.dto';
import { ListBroadcastLogDto } from '../broadcastLog/dto/list-broadcast-log.dto';
import { ListSessionDto } from './dto/list-session.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 100 });

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    appId: string,
    dto: ListSessionDto
  ): Promise<PaginatorTypes.PaginatedResult<Session>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.session,
      {
        where: {
          app: appId,
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.limit,
      }
    );
  }

  findOne(cuid: string) {
    return this.prisma.session.findUnique({
      where: {
        cuid,
      },
      include: {
        Transport: true,
      },
    });
  }

  listBroadcasts(
    cuid: string,
    dto: ListBroadcastDto
  ): Promise<PaginatorTypes.PaginatedResult<BroadcastLog>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcast,
      {
        where: {
          session: cuid,
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.limit,
      }
    );
  }

  listLogs(
    cuid: string,
    dto: ListBroadcastLogDto
  ): Promise<PaginatorTypes.PaginatedResult<BroadcastLog>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.broadcastLog,
      {
        where: {
          session: cuid,
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.limit,
      }
    );
  }
}
