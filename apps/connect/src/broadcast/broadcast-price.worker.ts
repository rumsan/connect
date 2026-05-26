import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@rumsan/prisma';
import { TwilioService } from '@rsconnect/templates';
import { ProviderConfigUtil } from '@rsconnect/templates';
import { BROADCAST_CONSTANTS } from './broadcast.constants';

@Injectable()
export class BroadcastPriceWorker {
  private readonly logger = new Logger(BroadcastPriceWorker.name);

  constructor(private readonly prisma: PrismaService) {}

  @Interval(
    BROADCAST_CONSTANTS.DEFAULT_BROADCAST_PRICE_UPDATE_WINDOW_MILLISECONDS,
  )
  async updateTwilioPrices() {
    this.logger.log(
      'Checking for broadcasts with null price and provider=twilio',
    );
    // Find broadcasts with null price and provider twilio
    const broadcasts = await this.prisma.broadcast.findMany({
      where: {
        OR: [
          { disposition: { path: ['price'], equals: null } },
          { disposition: { path: ['price'], equals: '' } },
        ],
        disposition: { path: ['provider'], equals: 'twilio' },
        isComplete: true,
      },
      include: {
        Transport: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (!broadcasts.length) return;
    for (const broadcast of broadcasts) {
      try {
        const twilioConfig = ProviderConfigUtil.extractConfig(
          broadcast.Transport,
        );
        const twilioService = new TwilioService(twilioConfig);
        const disposition =
          typeof broadcast.disposition === 'object' &&
          broadcast.disposition !== null &&
          !Array.isArray(broadcast.disposition)
            ? (broadcast.disposition as Record<string, any>)
            : {};
        const priceInfo = await twilioService.fetchTwilioMessageDetails(
          disposition['providerMessageSid'] || disposition['messageSid'],
        );
        if (priceInfo && priceInfo.price) {
          // Update broadcast
          await this.prisma.broadcast.update({
            where: { cuid: broadcast.cuid },
            data: {
              disposition: {
                ...disposition,
                price: priceInfo.price,
                priceUnit: priceInfo.price_unit,
              },
            },
          });

          // Update latest broadcast log for this broadcast
          const latestLog = await this.prisma.broadcastLog.findFirst({
            where: { broadcast: broadcast.cuid },
            orderBy: { createdAt: 'desc' },
          });
          if (latestLog) {
            const logDetails =
              typeof latestLog.details === 'object' &&
              latestLog.details !== null &&
              !Array.isArray(latestLog.details)
                ? (latestLog.details as Record<string, any>)
                : {};
            await this.prisma.broadcastLog.update({
              where: { cuid: latestLog.cuid },
              data: {
                details: {
                  ...logDetails,
                  price: priceInfo.price,
                  priceUnit: priceInfo.price_unit,
                },
              },
            });
          }
          this.logger.log(
            `Updated price for broadcast ${broadcast.cuid} and its latest log`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to update price for broadcast ${broadcast.cuid}: ${err}`,
        );
      }
    }
  }
}
