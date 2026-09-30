import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Broadcast, Prisma, Transport } from '@prisma/client';
import { BroadcastStatus, isTerminalBroadcastStatus } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import axios from 'axios';
import { BroadcastService } from '../broadcast/broadcast.service';

export interface AdnSmsPollOptions {
  transportCuid?: string;
  sinceDate?: string;
  limit?: number;
  dryRun?: boolean;
}

interface AdnSmsStatusResponse {
  sms?: {
    sms_uid?: string;
    campaign_uid?: string;
    recipient?: string;
    message_body?: string;
    length?: number;
    sms_quantity?: number;
    sms_status?: string;
  };
  api_response_code?: number;
  api_response_message?: string;
  error?: { error_code?: number; error_message?: string };
}

interface PollSummary {
  transportCuid: string;
  scanned: number;
  fetched: number;
  updated: number;
  skipped: number;
  failed: number;
  notFound: number;
}

// ADN sms_status → BroadcastStatus. Only SUCCESS/FAILED are terminal; anything
// still in flight (PENDING or unknown) is left for a later poll.
function mapAdnStatusToBroadcastStatus(
  smsStatus: string | null | undefined,
): BroadcastStatus {
  switch ((smsStatus ?? '').toUpperCase()) {
    case 'SUCCESS':
    case 'DELIVERED':
      return BroadcastStatus.SUCCESS;
    case 'FAILED':
    case 'FAIL':
    case 'REJECTED':
      return BroadcastStatus.FAIL;
    default:
      return BroadcastStatus.PENDING;
  }
}

@Injectable()
export class AdnSmsStatusService {
  private readonly logger = new Logger(AdnSmsStatusService.name);
  private readonly throttleMs = 75;

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
  ) {}

  async poll(opts: AdnSmsPollOptions = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
    const transports = await this.findAdnTransports(opts.transportCuid);

    if (transports.length === 0) {
      return { message: 'No ADN SMS transports found', transports: [] };
    }

    const summaries: PollSummary[] = [];
    for (const transport of transports) {
      summaries.push(await this.pollForTransport(transport, { ...opts, limit }));
    }

    return {
      message: opts.dryRun
        ? 'Dry run complete — no broadcasts were updated'
        : 'ADN status poll complete',
      dryRun: !!opts.dryRun,
      transports: summaries,
    };
  }

  private async pollForTransport(
    transport: Transport,
    opts: AdnSmsPollOptions,
  ): Promise<PollSummary> {
    const summary: PollSummary = {
      transportCuid: transport.cuid,
      scanned: 0,
      fetched: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      notFound: 0,
    };

    const creds = this.extractCredentials(transport);
    if (!creds) {
      this.logger.warn(
        `Transport ${transport.cuid} missing ADN credentials/url — skipping`,
      );
      return summary;
    }

    const broadcasts = await this.findIncompleteBroadcasts(
      transport.cuid,
      opts.sinceDate,
      opts.limit ?? 500,
    );
    summary.scanned = broadcasts.length;

    for (const broadcast of broadcasts) {
      const smsUid = this.extractProviderMessageSid(broadcast.disposition);
      if (!smsUid) {
        summary.skipped++;
        continue;
      }

      try {
        const res = await this.fetchSmsStatus(creds, smsUid);
        if (!res || res.api_response_code !== 200 || !res.sms) {
          // RECORD_NOT_FOUND / transient — leave it pending for the next poll.
          summary.notFound++;
          continue;
        }
        summary.fetched++;

        const status = mapAdnStatusToBroadcastStatus(res.sms.sms_status);
        if (opts.dryRun) {
          this.logger.log(
            `[dryRun] broadcast=${broadcast.cuid} sms_uid=${smsUid} sms_status=${res.sms.sms_status}`,
          );
          continue;
        }

        // Only act on a final outcome; still-pending needs no write.
        if (!isTerminalBroadcastStatus(status)) {
          summary.skipped++;
          continue;
        }

        const applied = await this.applyStatus(broadcast, smsUid, status, res);
        if (applied) summary.updated++;
        else summary.skipped++;
      } catch (err: any) {
        summary.failed++;
        this.logger.error(
          `ADN status poll failed for broadcast=${broadcast.cuid} sms_uid=${smsUid}: ${
            err?.message ?? err
          }`,
        );
      }

      await this.sleep(this.throttleMs);
    }

    return summary;
  }

  private async applyStatus(
    broadcast: Broadcast,
    smsUid: string,
    status: BroadcastStatus,
    res: AdnSmsStatusResponse,
  ): Promise<boolean> {
    // Idempotency: never overwrite an already-final broadcast.
    if (isTerminalBroadcastStatus(broadcast.status as BroadcastStatus)) {
      return false;
    }

    const disposition = {
      ...((broadcast.disposition as Record<string, any>) ?? {}),
      provider: 'adnsms',
      providerStatus: res.sms?.sms_status ?? null,
      providerMessageSid: res.sms?.sms_uid ?? smsUid,
      campaignUid: res.sms?.campaign_uid ?? null,
      recipient: res.sms?.recipient ?? null,
      lastPolledAt: new Date().toISOString(),
      lastStatusPayload: res as unknown as Record<string, any>,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.broadcastLog.create({
        data: {
          cuid: createId(),
          app: broadcast.app,
          session: broadcast.session,
          broadcast: broadcast.cuid,
          status,
          attempt: Math.max(broadcast.attempts ?? 0, 1),
          details: disposition,
          notes: `ADN sms-status poll: ${res.sms?.sms_status ?? 'unknown'}`,
        },
      });

      await tx.broadcast.update({
        where: { cuid: broadcast.cuid },
        data: {
          status,
          disposition,
          isComplete: isTerminalBroadcastStatus(status),
        },
      });
    });

    if (isTerminalBroadcastStatus(status)) {
      await this.broadcastService.syncSessionCompletion(broadcast.session);
    }
    return true;
  }

  private async findAdnTransports(transportCuid?: string) {
    if (transportCuid) {
      const t = await this.prisma.transport.findUnique({
        where: { cuid: transportCuid },
      });
      if (!t) return [];
      const provider = (t.config as any)?.meta?.provider;
      return provider === 'adnsms' ? [t] : [];
    }

    return this.prisma.$queryRaw<Transport[]>(Prisma.sql`
      SELECT *
      FROM "tbl_transports"
      WHERE COALESCE(config -> 'meta' ->> 'provider', '') = 'adnsms'
        AND "deletedAt" IS NULL
    `);
  }

  private async findIncompleteBroadcasts(
    transportCuid: string,
    sinceDate: string | undefined,
    limit: number,
  ) {
    const since = sinceDate ? new Date(sinceDate) : null;
    if (since && Number.isNaN(since.getTime())) {
      throw new Error(`Invalid sinceDate: ${sinceDate}`);
    }

    return this.prisma.broadcast.findMany({
      where: {
        transport: transportCuid,
        isComplete: false,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private extractProviderMessageSid(disposition: unknown): string | null {
    if (!disposition || typeof disposition !== 'object') return null;
    const d = disposition as Record<string, any>;
    return d.providerMessageSid ?? d.sms_uid ?? null;
  }

  private extractCredentials(
    transport: Transport,
  ): { apiKey: string; apiSecret: string; statusUrl: string } | null {
    const config = (transport.config as Record<string, any>) ?? {};
    const body = (config['body'] as Record<string, any>) ?? {};
    const meta = (config['meta'] as Record<string, any>) ?? {};

    const apiKey =
      body['api_key'] ?? meta['apiKey'] ?? process.env['ADN_SMS_API_KEY'];
    const apiSecret =
      body['api_secret'] ??
      meta['apiSecret'] ??
      process.env['ADN_SMS_API_SECRET'];
    const sendUrl: string | undefined = config['url'];

    if (!apiKey || !apiSecret || !sendUrl) return null;

    // Same base as send-sms, different action.
    const statusUrl =
      meta['statusUrl'] ?? sendUrl.replace('/send-sms', '/sms-status');
    return { apiKey, apiSecret, statusUrl };
  }

  private async fetchSmsStatus(
    creds: { apiKey: string; apiSecret: string; statusUrl: string },
    smsUid: string,
  ): Promise<AdnSmsStatusResponse | null> {
    const body = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      sms_uid: smsUid,
    });

    try {
      const res = await axios.post<AdnSmsStatusResponse>(creds.statusUrl, body, {
        headers: { Accept: 'application/json' },
        timeout: 15000,
      });
      return res.data;
    } catch (err: any) {
      // ADN returns HTTP 400 + RECORD_NOT_FOUND while a message is still
      // propagating; surface that body so the caller treats it as "not yet
      // resolvable" rather than a hard failure.
      const data = err?.response?.data;
      if (data && typeof data === 'object') return data as AdnSmsStatusResponse;
      throw new Error(
        `ADN sms-status fetch failed for ${smsUid}: ${err?.message ?? 'network'}`,
      );
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
