import { Injectable, Logger } from '@nestjs/common';
import { Broadcast, Session } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { IDataProvider } from './data-provider.interface';

@Injectable()
export class PrismaProvider implements IDataProvider {
  private readonly logger = new Logger(PrismaProvider.name);
  constructor(protected readonly prisma: PrismaService) {
    this.logger.log('Initialized PrismaProvider');
  }
  async getSession(sessionCuid: string): Promise<Session> {
    this.logger.log(`Fetching session: ${sessionCuid}`);
    try {
      const session = await this.prisma.session.findUnique({
        where: {
          cuid: sessionCuid,
        },
        include: {
          Transport: true,
        },
      });
      this.logger.log(`Successfully fetched session: ${sessionCuid}`);
      return session as Session;
    } catch (error) {
      this.logger.error(`Failed to fetch session: ${sessionCuid}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async getBroadcast(broadcastCuid: string): Promise<Broadcast> {
    this.logger.log(`Fetching broadcast: ${broadcastCuid}`);
    try {
      const broadcast = await this.prisma.broadcast.findUnique({
        where: {
          cuid: broadcastCuid,
        },
      });
      this.logger.log(`Successfully fetched broadcast: ${broadcastCuid}`);
      return broadcast as Broadcast;
    } catch (error) {
      this.logger.error(`Failed to fetch broadcast: ${broadcastCuid}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async getBroadcasts(broadcastCuids: string[]): Promise<Broadcast[]> {
    this.logger.log(`Fetching ${broadcastCuids.length} broadcasts`);
    try {
      const broadcasts = await this.prisma.broadcast.findMany({
        where: {
          cuid: {
            in: broadcastCuids,
          },
        },
      });
      this.logger.log(`Successfully fetched ${broadcasts.length} broadcasts`);
      return broadcasts as Broadcast[];
    } catch (error) {
      this.logger.error(`Failed to fetch broadcasts`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
