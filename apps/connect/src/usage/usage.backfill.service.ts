import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { UsageService } from './usage.service';

@Injectable()
export class UsageBackfillService {
  private readonly logger = new Logger(UsageBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
  ) {}

  async backfill(batchSize = 100, concurrency = 5, appId?: string) {
    const scope = appId ? `app ${appId}` : 'all apps';
    this.logger.log(`Clearing existing usage snapshots for ${scope}...`);
    await this.prisma.usageSnapshot.deleteMany({
      where: appId ? { app: appId } : {},
    });
    this.logger.log(`Starting usage backfill from scratch for ${scope}...`);
    let cursor: number | undefined;
    let total = 0;

    let hasMore = true;
    while (hasMore) {
      const sessions = await this.prisma.session.findMany({
        where: {
          ...(appId ? { app: appId } : {}),
          status: { in: ['PENDING', 'COMPLETED'] },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        include: { Transport: true },
      });

      if (!sessions.length) {
        hasMore = false;
        break;
      }

      const chunks: typeof sessions[] = [];
      for (let i = 0; i < sessions.length; i += concurrency) {
        chunks.push(sessions.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map((s) =>
            this.usageService
              .calculateAndRecordUsage(s.cuid)
              .catch((err) =>
                this.logger.warn(
                  `Backfill failed for session ${s.cuid}: ${err.message}`,
                ),
              ),
          ),
        );
      }

      cursor = sessions[sessions.length - 1].id;
      total += sessions.length;
      this.logger.log(`Backfilled ${total} sessions...`);
    }

    this.logger.log(`Backfill complete for ${scope}. Total sessions: ${total}`);
    return { appId, total };
  }
}
