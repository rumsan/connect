import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createId } from '@paralleldrive/cuid2';
import { TransportType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { getSmsSegments } from './sms-segments.util';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('broadcast.session.completed')
  async handleSessionCompleted(sessionCuid: string) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { cuid: sessionCuid },
        include: { Transport: true },
      });
      if (!session) return;

      const broadcasts = await this.prisma.broadcast.findMany({
        where: { session: sessionCuid, isComplete: true },
      });
      if (!broadcasts.length) return;

      const pricing = await this.prisma.transportPricing.findUnique({
        where: { transportCuid: session.transport },
      });
      const date = startOfDay(session.updatedAt ?? session.createdAt);

      const broadcastCount = broadcasts.length;
      const successCount = broadcasts.filter(
        (b) => b.status === 'SUCCESS',
      ).length;
      const failCount = broadcasts.filter((b) => b.status === 'FAIL').length;

      let chars = 0;
      let segments = 0;
      if (pricing?.unitType === 'SEGMENT') {
        const body =
          (session.message as any)?.body ??
          (session.message as any)?.content ??
          '';
        const info = getSmsSegments(body);
        chars = info.chars * successCount;
        segments = info.segments * successCount;
      }

      let duration = 0;
      if (session.Transport.type === 'VOICE') {
        for (const b of broadcasts) {
          if (b.status === 'SUCCESS') {
            duration += (b.disposition as any)?.duration ?? 0;
          }
        }
      }

      const credits = this.calculateCredits(
        pricing,
        successCount,
        segments,
        duration,
      );

      await this.upsertSnapshot({
        sessionCuid,
        app: session.app,
        xref: '',
        transportCuid: session.transport,
        transportType: session.Transport.type as TransportType,
        date,
        sessionIncrement: 1,
        broadcastCount,
        success: successCount,
        fail: failCount,
        chars,
        segments,
        duration,
        calls: successCount,
        credits,
      });

      if (session.xref) {
        await this.upsertSnapshot({
          sessionCuid,
          app: session.app,
          xref: session.xref,
          transportCuid: session.transport,
          transportType: session.Transport.type as TransportType,
          date,
          sessionIncrement: 1,
          broadcastCount,
          success: successCount,
          fail: failCount,
          chars,
          segments,
          duration,
          calls: successCount,
          credits,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to record usage for session ${sessionCuid}: ${error.message}`,
      );
    }
  }

  private calculateCredits(
    pricing: {
      creditPerUnit: { toString: () => string };
      unitType: string;
    } | null,
    successCount: number,
    segments: number,
    durationSec: number,
  ): number {
    if (!pricing) return 0;
    const rate = Number(pricing.creditPerUnit.toString());
    switch (pricing.unitType) {
      case 'MESSAGE':
      case 'API_CALL':
        return rate * successCount;
      case 'SEGMENT':
        return rate * segments;
      case 'SECOND':
        return rate * durationSec;
      case 'MINUTE':
        return rate * Math.ceil(durationSec / 60);
      default:
        return 0;
    }
  }

  private async upsertSnapshot(data: {
    sessionCuid: string;
    app: string;
    xref: string;
    transportCuid: string;
    transportType: TransportType;
    date: Date;
    sessionIncrement: number;
    broadcastCount: number;
    success: number;
    fail: number;
    chars: number;
    segments: number;
    duration: number;
    calls: number;
    credits: number;
  }) {
    await this.prisma.usageSnapshot.upsert({
      where: {
        app_xref_transportCuid_date: {
          app: data.app,
          xref: data.xref,
          transportCuid: data.transportCuid,
          date: data.date,
        },
      },
      create: {
        cuid: createId(),
        app: data.app,
        xref: data.xref,
        transportCuid: data.transportCuid,
        transportType: data.transportType,
        date: data.date,
        sessionCount: data.sessionIncrement,
        broadcastCount: data.broadcastCount,
        successCount: data.success,
        failCount: data.fail,
        totalCharacters: data.chars,
        totalSegments: data.segments,
        totalDurationSec: data.duration,
        totalCalls: data.calls,
        creditsUsed: data.credits,
        sessionCuids: [data.sessionCuid],
      },
      update: {
        sessionCount: { increment: data.sessionIncrement },
        broadcastCount: { increment: data.broadcastCount },
        successCount: { increment: data.success },
        failCount: { increment: data.fail },
        totalCharacters: { increment: data.chars },
        totalSegments: { increment: data.segments },
        totalDurationSec: { increment: data.duration },
        totalCalls: { increment: data.calls },
        creditsUsed: { increment: data.credits },
        sessionCuids: { push: [data.sessionCuid] },
      },
    });
  }

  async getUsage(app: string, xref: string, from?: string, to?: string) {
    const where: any = { app, xref };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const snapshots = await this.prisma.usageSnapshot.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const transportCuids = [...new Set(snapshots.map((s) => s.transportCuid))];
    const transports = await this.prisma.transport.findMany({
      where: { cuid: { in: transportCuids } },
      select: { cuid: true, name: true, type: true },
    });
    const transportMap = new Map(
      transports.map((t) => [t.cuid, { name: t.name, type: t.type }]),
    );

    const byTransport: Record<string, any> = {};
    const totals = {
      sessions: 0,
      broadcasts: 0,
      success: 0,
      fail: 0,
      chars: 0,
      segments: 0,
      duration: 0,
      calls: 0,
      credits: 0,
    };

    for (const s of snapshots) {
      const cuid = s.transportCuid;
      if (!byTransport[cuid]) {
        const info = transportMap.get(cuid);
        byTransport[cuid] = {
          transportCuid: cuid,
          transportName: info?.name ?? 'Unknown',
          transportType: s.transportType,
          broadcasts: 0,
          success: 0,
          fail: 0,
          chars: 0,
          segments: 0,
          duration: 0,
          calls: 0,
          credits: 0,
        };
      }
      byTransport[cuid].broadcasts += s.broadcastCount;
      byTransport[cuid].success += s.successCount;
      byTransport[cuid].fail += s.failCount;
      byTransport[cuid].chars += s.totalCharacters;
      byTransport[cuid].segments += s.totalSegments;
      byTransport[cuid].duration += s.totalDurationSec;
      byTransport[cuid].calls += s.totalCalls;
      byTransport[cuid].credits += Number(s.creditsUsed);

      totals.sessions += s.sessionCount;
      totals.broadcasts += s.broadcastCount;
      totals.success += s.successCount;
      totals.fail += s.failCount;
      totals.chars += s.totalCharacters;
      totals.segments += s.totalSegments;
      totals.duration += s.totalDurationSec;
      totals.calls += s.totalCalls;
      totals.credits += Number(s.creditsUsed);
    }

    return { totals, byTransport: Object.values(byTransport) };
  }

  async getCredits(app: string, xref: string, from?: string, to?: string) {
    const where: any = { app, xref };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const transportCuids = await this.prisma.usageSnapshot.findMany({
      where,
      select: { transportCuid: true },
      distinct: ['transportCuid'],
    });
    const tCuidList = transportCuids.map((t) => t.transportCuid);
    const transports = await this.prisma.transport.findMany({
      where: { cuid: { in: tCuidList } },
      select: { cuid: true, name: true },
    });
    const transportNameMap = new Map(
      transports.map((t) => [t.cuid, t.name]),
    );

    const snapshots = await this.prisma.usageSnapshot.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return snapshots.map((s) => ({
      date: s.date,
      transportCuid: s.transportCuid,
      transportName: transportNameMap.get(s.transportCuid) ?? 'Unknown',
      transportType: s.transportType,
      credits: Number(s.creditsUsed),
      sessions: s.sessionCount,
      broadcasts: s.broadcastCount,
      sessionCuids: s.sessionCuids,
    }));
  }
}
