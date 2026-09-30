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

type PlasgateDlrPayload = Record<string, any>;

// Plasgate (Jasmin) DLR `message_status` → BroadcastStatus.
function mapPlasgateStatusToBroadcastStatus(
  messageStatus: string | null,
  errCode: string | null,
): BroadcastStatus {
  if (errCode && errCode !== '000' && errCode !== '0') {
    return BroadcastStatus.FAIL;
  }

  switch ((messageStatus ?? '').toUpperCase()) {
    case 'DELIVRD':
      return BroadcastStatus.SUCCESS;
    case 'UNDELIV':
    case 'EXPIRED':
    case 'REJECTD':
    case 'DELETED':
    case 'UNKNOWN':
      return BroadcastStatus.FAIL;
    // ESME_ROK / ACCEPTD / BUFFRED and anything else = not yet final.
    default:
      return BroadcastStatus.PENDING;
  }
}

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

    // If Twilio sends an ErrorCode, the message failed regardless of what
    // MessageStatus says (e.g. it can arrive as "queued" alongside an error).
    const hasErrorCode = !!body.ErrorCode;
    const groupedStatus =
      hasErrorCode &&
      (!providerStatus || !['delivered', 'read'].includes(providerStatus))
        ? BroadcastStatus.FAIL
        : providerStatus
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

    const errorCode = body.ErrorCode ? String(body.ErrorCode) : null;
    const TWILIO_ERROR_MESSAGES: Record<string, string> = {
      '63049': 'Meta chose not to deliver this WhatsApp marketing message',
    };
    const errorMessage = errorCode
      ? TWILIO_ERROR_MESSAGES[errorCode] ?? `Twilio error code: ${errorCode}`
      : null;

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
      ...(errorCode ? { errorCode, error: errorMessage } : {}),
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
          notes: errorMessage
            ? `Twilio error ${errorCode}: ${errorMessage}`
            : providerStatus
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

  async handlePlasgateDlrWebhook(params: PlasgateDlrPayload) {
    this.logger.log(`Received Plasgate DLR: ${JSON.stringify(params)}`);

    const providerMessageSid = params?.id ? String(params.id) : undefined;
    if (!providerMessageSid) {
      return { message: 'Plasgate DLR received without id', processed: false };
    }

    const level = params?.level != null ? String(params.level) : null;
    const rawStatus = params?.message_status
      ? String(params.message_status)
      : null;
    const errCode = params?.err != null ? String(params.err) : null;
    const status = mapPlasgateStatusToBroadcastStatus(rawStatus, errCode);

    const broadcast = await this.findBroadcastByProviderMessageSid(
      providerMessageSid,
    );
    if (!broadcast) {
      this.logger.warn(
        `No broadcast found for Plasgate message id ${providerMessageSid}`,
      );
      return {
        message: 'Plasgate DLR received but no broadcast matched',
        processed: false,
      };
    }

    // Idempotency / ordering guard: once a broadcast is final, ignore duplicate
    // finals and any late non-final (submission) callbacks.
    const currentStatus = broadcast.status as BroadcastStatus;
    if (
      isTerminalBroadcastStatus(currentStatus) &&
      (currentStatus === status || !isTerminalBroadcastStatus(status))
    ) {
      return {
        message: 'Plasgate DLR ignored (already final or duplicate)',
        processed: false,
        broadcastId: broadcast.cuid,
        providerMessageSid,
        broadcastStatus: currentStatus,
      };
    }

    const attempt = Math.max(
      broadcast.attempts,
      broadcast.Logs[0]?.attempt ?? 0,
      1,
    );

    const disposition = {
      ...((broadcast.disposition as Record<string, any>) ?? {}),
      provider: 'plasgate',
      providerStatus: rawStatus,
      providerMessageSid,
      level,
      idSmsc: params?.id_smsc ?? null,
      err: errCode,
      subdate: params?.subdate ?? null,
      donedate: params?.donedate ?? null,
      lastWebhookAt: new Date().toISOString(),
      lastWebhookPayload: params,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.broadcastLog.create({
        data: {
          cuid: createId(),
          app: broadcast.app,
          session: broadcast.session,
          broadcast: broadcast.cuid,
          status,
          attempt,
          details: disposition,
          notes: `Plasgate DLR level ${level ?? '?'}: ${
            rawStatus ?? 'unknown'
          }${errCode && errCode !== '000' ? ` (err ${errCode})` : ''}`,
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

    return {
      message: 'Plasgate DLR processed successfully',
      processed: true,
      broadcastId: broadcast.cuid,
      providerMessageSid,
      providerStatus: rawStatus,
      broadcastStatus: status,
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
