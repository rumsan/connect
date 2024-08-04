import { Injectable } from '@nestjs/common';
import { IDataProvider } from './data-provider.interface';
import { PrismaService } from '@rumsan/prisma';
import { Session } from '@rsconnect/sdk/types';

@Injectable()
export class PrismaProvider implements IDataProvider {
  constructor(protected readonly prisma: PrismaService) {}
  async getSession(cuid: string): Promise<Session> {
    return (await this.prisma.session.findUnique({
      where: {
        cuid,
      },
      include: {
        Transport: true,
      },
    })) as Session;
  }
}
