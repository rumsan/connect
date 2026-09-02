import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@rumsan/prisma';
import axios from 'axios';
import { Queue } from 'bull';
import { createHmac } from 'node:crypto';
import {
  SESSION_WEBHOOK_JOB,
  SESSION_WEBHOOK_QUEUE,
  SessionWebhookJobData,
} from './session-webhook.queue';

// Thrown when retrying cannot possibly help — a bad URL, or a 4xx saying the
// receiver rejected the payload itself. The worker discards these.
export class PermanentWebhookError extends Error {}

const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class SessionWebhookService {
  private readonly logger = new Logger(SessionWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SESSION_WEBHOOK_QUEUE)
    private readonly queue: Queue<SessionWebhookJobData>,
  ) {}

  @OnEvent('broadcast.session.executed')
  async handleSessionExecuted(sessionCuid: string) {
    // Opt-out switch — no redeploy needed to stop calling out.
    if (process.env['SESSION_WEBHOOK_ENABLED'] === 'false') return;

    try {
      const session = await this.prisma.session.findUnique({
        where: { cuid: sessionCuid },
        select: { cuid: true, webhook: true },
      });

      // Most sessions carry no webhook — that is the normal path, not an error.
      if (!session?.webhook) return;

      await this.queue.add(
        SESSION_WEBHOOK_JOB,
        { sessionCuid },
        {
          // Bull refuses a second job with an id it already holds, so a
          // duplicate event cannot become a duplicate POST.
          jobId: sessionCuid,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      this.logger.log(`Queued completion webhook for session ${sessionCuid}`);
    } catch (error) {
      this.logger.error(
        `Failed to queue completion webhook for session ${sessionCuid}: ${error.message}`,
      );
    }
  }

  async deliver(sessionCuid: string) {
    const session = await this.prisma.session.findUnique({
      where: { cuid: sessionCuid },
      include: {
        Transport: { select: { cuid: true, name: true, type: true } },
      },
    });

    if (!session?.webhook) {
      throw new PermanentWebhookError(
        `Session ${sessionCuid} has no webhook url`,
      );
    }

    const url = this.parseSafeWebhookUrl(session.webhook);
    const payload = await this.buildPayload(session);
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'rumsan-connect-webhook/1',
      'x-connect-event': payload.event,
      'x-connect-timestamp': timestamp,
    };

    const signature = this.sign(timestamp, body);
    if (signature) headers['x-connect-signature'] = `sha256=${signature}`;

    const response = await axios.post(url.toString(), body, {
      headers,
      timeout:
        Number(process.env['SESSION_WEBHOOK_TIMEOUT_MS']) || DEFAULT_TIMEOUT_MS,
      // Never chase a redirect: it could land somewhere the URL guard rejected.
      maxRedirects: 0,
      // Classify the status ourselves rather than letting axios throw on 4xx.
      validateStatus: () => true,
      transitional: { clarifyTimeoutError: true },
    });

    const { status } = response;

    if (status >= 200 && status < 300) {
      this.logger.log(
        `Completion webhook for session ${sessionCuid} accepted (${status})`,
      );
      return { sessionCuid, status };
    }

    // 408 and 429 are the receiver asking us to come back; every other 4xx is
    // it telling us this request will never be accepted.
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      throw new PermanentWebhookError(
        `Webhook for session ${sessionCuid} rejected with ${status}`,
      );
    }

    throw new Error(`Webhook for session ${sessionCuid} failed with ${status}`);
  }

  private async buildPayload(session: {
    cuid: string;
    app: string;
    xref: string | null;
    status: string;
    totalAddresses: number;
    updatedAt: Date | null;
    Transport: { cuid: string; name: string; type: string };
  }) {
    const grouped = await this.prisma.broadcast.groupBy({
      by: ['status'],
      where: { session: session.cuid },
      _count: { _all: true },
    });

    const countOf = (...statuses: string[]) =>
      grouped
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      event: 'session.completed',
      sessionCuid: session.cuid,
      app: session.app,
      xref: session.xref,
      transport: {
        cuid: session.Transport.cuid,
        name: session.Transport.name,
        type: session.Transport.type,
      },
      status: session.status,
      totalAddresses: session.totalAddresses,
      stats: {
        success: countOf('SUCCESS'),
        fail: countOf('FAIL'),
        pending: countOf('SCHEDULED', 'PENDING'),
      },

      executedAt: new Date().toISOString(),
    };
  }

  private sign(timestamp: string, body: string) {
    const secret = process.env['WEBHOOK_SIGNING_SECRET'];
    if (!secret) {
      this.logger.warn(
        'WEBHOOK_SIGNING_SECRET is not set — sending webhook unsigned',
      );
      return null;
    }
    // Timestamp is inside the signed material so a captured body cannot be
    // replayed later against a receiver that checks freshness.
    return createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }

  private parseSafeWebhookUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new PermanentWebhookError(`Invalid webhook url: ${raw}`);
    }

    const allowInsecure = process.env['WEBHOOK_ALLOW_INSECURE'] === 'true';
    const allowedProtocols = allowInsecure ? ['https:', 'http:'] : ['https:'];

    if (!allowedProtocols.includes(url.protocol)) {
      throw new PermanentWebhookError(
        `Webhook url must use https: ${url.protocol}//`,
      );
    }

    // Local development points webhooks at localhost, so the same switch that
    // permits http also permits private destinations.
    if (allowInsecure) return url;

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivate =
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '::1' ||
      host === '::';

    if (isPrivate) {
      throw new PermanentWebhookError(`Webhook host is not public: ${host}`);
    }

    return url;
  }
}
