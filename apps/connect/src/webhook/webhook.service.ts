import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import {
  BroadcastStatus,
  isTerminalBroadcastStatus,
  mapTwilioMessageStatusToBroadcastStatus,
  normalizeTwilioMessageStatus,
} from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { BroadcastService } from '../broadcast/broadcast.service';

type TwilioWebhookPayload = Record<string, any>;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
  ) {}

  async handleMessageStatusWebhook(body: TwilioWebhookPayload) {
    this.logger.log(`Received webhook message: ${JSON.stringify(body)}`);

    const providerMessageSid = this.getProviderMessageSid(body);
    if (!providerMessageSid) {
      return {
        message: 'Webhook received without MessageSid',
        processed: false,
      };
    }

    const rawProviderStatus = body.MessageStatus ?? body.SmsStatus;
    const providerStatus = normalizeTwilioMessageStatus(rawProviderStatus);
    const groupedStatus = providerStatus
      ? mapTwilioMessageStatusToBroadcastStatus(providerStatus)
      : BroadcastStatus.PENDING;

    const broadcast = await this.findBroadcastByProviderMessageSid(
      providerMessageSid,
    );
    if (!broadcast) {
      this.logger.warn(
        `No broadcast found for provider message sid ${providerMessageSid}`,
      );
      return {
        message: 'Webhook received but no broadcast matched MessageSid',
        processed: false,
      };
    }

    const attempt = Math.max(
      broadcast.attempts,
      broadcast.Logs[0]?.attempt ?? 0,
      1,
    );

    const disposition = {
      ...((broadcast.disposition as Record<string, any>) ?? {}),
      provider: 'twilio',
      providerStatus: providerStatus ?? rawProviderStatus ?? null,
      providerMessageSid,
      messageSid: providerMessageSid,
      accountSid: body.AccountSid ?? null,
      messagingServiceSid: body.MessagingServiceSid ?? null,
      lastWebhookAt: new Date().toISOString(),
      lastWebhookPayload: body,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.broadcastLog.create({
        data: {
          cuid: createId(),
          app: broadcast.app,
          session: broadcast.session,
          broadcast: broadcast.cuid,
          status: groupedStatus,
          attempt,
          details: disposition,
          notes: providerStatus
            ? `Twilio status callback: ${providerStatus}`
            : 'Twilio status callback',
        },
      });

      await tx.broadcast.update({
        where: {
          cuid: broadcast.cuid,
        },
        data: {
          status: groupedStatus,
          disposition,
          isComplete: isTerminalBroadcastStatus(groupedStatus),
        },
      });
    });

    if (isTerminalBroadcastStatus(groupedStatus)) {
      await this.broadcastService.syncSessionCompletion(broadcast.session);
    }

    return {
      message: 'Webhook received successfully',
      processed: true,
      broadcastId: broadcast.cuid,
      providerMessageSid,
      providerStatus: providerStatus ?? rawProviderStatus ?? null,
      broadcastStatus: groupedStatus,
    };
  }

  private getProviderMessageSid(
    body: TwilioWebhookPayload,
  ): string | undefined {
    return body.MessageSid ?? body.SmsSid;
  }

  private async findBroadcastByProviderMessageSid(providerMessageSid: string) {
    const matches = await this.prisma.$queryRaw<
      Array<{ cuid: string }>
    >(Prisma.sql`
      SELECT DISTINCT b.cuid
      FROM "tbl_broadcasts" b
      LEFT JOIN "tbl_broadcast_logs" bl ON bl.broadcast = b.cuid
      WHERE COALESCE(b.disposition ->> 'providerMessageSid', '') = ${providerMessageSid}
         OR COALESCE(b.disposition ->> 'messageSid', '') = ${providerMessageSid}
         OR COALESCE(b.disposition ->> 'sid', '') = ${providerMessageSid}
         OR COALESCE(b.disposition ->> 'MessageSid', '') = ${providerMessageSid}
         OR COALESCE(b.disposition ->> 'SmsSid', '') = ${providerMessageSid}
         OR COALESCE(bl.details ->> 'providerMessageSid', '') = ${providerMessageSid}
         OR COALESCE(bl.details ->> 'messageSid', '') = ${providerMessageSid}
         OR COALESCE(bl.details ->> 'sid', '') = ${providerMessageSid}
         OR COALESCE(bl.details ->> 'MessageSid', '') = ${providerMessageSid}
         OR COALESCE(bl.details ->> 'SmsSid', '') = ${providerMessageSid}
      ORDER BY b.cuid DESC
      LIMIT 1
    `);

    if (!matches[0]?.cuid) {
      return null;
    }

    return this.prisma.broadcast.findUnique({
      where: {
        cuid: matches[0].cuid,
      },
      include: {
        Logs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });
  }
}
