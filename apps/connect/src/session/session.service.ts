import { Injectable } from '@nestjs/common';
import { BroadcastLog, Session } from '@prisma/client';
import { BroadcastStatus, TransportType } from '@rumsan/connect/types';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { BroadcastService } from '../broadcast/broadcast.service';
import { ListBroadcastDto } from '../broadcast/dto/broadcast.dto';
import { ListBroadcastLogDto } from '../broadcastLog/dto/list-broadcast-log.dto';
import { ListSessionDto } from './dto/list-session.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 100 });

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
  ) { }

  async triggerBroadcast(sessionCuid: string, retryFailed?: boolean) {
    const session = await this.prisma.session.findUnique({
      where: {
        cuid: sessionCuid,
      },
      include: {
        Transport: true,
      },
    });
    if (!session) {
      throw new Error('Session not found');
    }

    return this.broadcastService.retryBroadcasts(
      session.cuid,
      session.Transport.type as TransportType,
      retryFailed,
    );
  }

  findAll(
    appId: string,
    dto: ListSessionDto,
  ): Promise<PaginatorTypes.PaginatedResult<Session>> {
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort] = dto.order;
    return paginate(
      this.prisma.session,
      {
        where: {
          app: appId,
          xref: dto.xref
        },
        orderBy,
      },
      {
        page: dto.page,
        perPage: dto.perPage,
      },
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
    dto: ListBroadcastDto,
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
        perPage: dto.perPage,
      },
    );
  }

  listLogs(
    cuid: string,
    dto: ListBroadcastLogDto,
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
        perPage: dto.perPage,
      },
    );
  }

  async getBroadcastCountByStatuses(sessionCuids: string[]): Promise<Record<BroadcastStatus | 'TOTAL', number>> {
    const counts = await this.prisma.broadcast.groupBy({
      by: ['status'],
      where: {
        session: { in: sessionCuids },
      },
      _count: {
        status: true,
      },
    });

    const result = counts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      acc['TOTAL'] = (acc['TOTAL'] || 0) + item._count.status;
      return acc;
    }, {} as Record<BroadcastStatus | 'TOTAL', number>);

    return result;
  }
}
