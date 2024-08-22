import { Injectable } from '@nestjs/common';
import { Broadcast, Session } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { IDataProvider } from './data-provider.interface';

@Injectable()
export class PrismaProvider implements IDataProvider {
  constructor(protected readonly prisma: PrismaService) {}
  async getSession(sessionCuid: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: {
        cuid: sessionCuid,
      },
      include: {
        Transport: true,
      },
    });
    return session as Session;
  }

  async getBroadcast(broadcastCuid: string): Promise<Broadcast> {
    return (await this.prisma.broadcast.findUnique({
      where: {
        cuid: broadcastCuid,
      },
    })) as Broadcast;
  }
}
