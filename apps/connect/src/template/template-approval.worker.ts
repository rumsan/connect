import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TemplateStatus } from '@prisma/client';
import {
  TemplateProviderFactory,
  TemplateVerificationService,
} from '@rsconnect/templates';
import { PrismaService } from '@rumsan/prisma';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

@Injectable()
export class TemplateApprovalWorker {
  private readonly logger = new Logger(TemplateApprovalWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateProviderFactory: TemplateProviderFactory,
    private readonly templateVerificationService: TemplateVerificationService,
  ) {}

  @Interval(
    Number(process.env.TEMPLATE_APPROVAL_POLL_INTERVAL_MS) ||
      DEFAULT_POLL_INTERVAL_MS,
  )
  async checkPendingTemplates() {
    const templates = await this.prisma.template.findMany({
      where: {
        status: TemplateStatus.PENDING,
        isActive: true,
      },
      include: { Transport: true },
    });

    if (!templates.length) return;

    // Group by transportId to minimize provider instantiation
    const grouped = new Map<string, typeof templates>();
    for (const t of templates) {
      const key = t.transportId;
      if (!grouped.has(key)) grouped.set(key, []);
      const arr = grouped.get(key);
      if (arr) arr.push(t);
    }

    for (const [, group] of grouped) {
      const transport = group[0].Transport;
      if (!transport) continue;

      // Only poll transports that require template verification
      if (
        !this.templateVerificationService.requiresTemplateVerification(
          transport,
        )
      ) {
        continue;
      }

      const provider = this.templateProviderFactory.create(transport);

      for (const template of group) {
        if (!template.externalId) continue;

        try {
          const result = await provider.getApprovalStatus(template.externalId);
          this.logger.debug(
            `Checked approval for template '${template.cuid}': ${JSON.stringify(
              result,
            )}`,
          );

          await this.handleTemplateStatusUpdate(template, result);
        } catch (err) {
          this.logger.error(
            `Failed to check approval for template '${template.cuid}'`,
            err as Error,
          );
        }
      }
    }
  }

  private async handleTemplateStatusUpdate(
    template: { cuid: string },
    result: { status: string; rejectionReason?: string },
  ) {
    const statusHandlers: Record<
      string,
      () => { data: Record<string, unknown>; log: () => void }
    > = {
      APPROVED: () => ({
        data: {
          status: TemplateStatus.APPROVED,
          lastApprovalCheck: new Date(),
        },
        log: () =>
          this.logger.log(`Template '${template.cuid}' approved by provider`),
      }),
      REJECTED: () => ({
        data: {
          status: TemplateStatus.REJECTED,
          info: result.rejectionReason ?? 'Rejected by provider',
          lastApprovalCheck: new Date(),
        },
        log: () =>
          this.logger.warn(
            `Template '${template.cuid}' rejected by provider: ${
              result.rejectionReason ?? 'no reason'
            }`,
          ),
      }),
      PENDING: () => ({
        data: {
          lastApprovalCheck: new Date(),
        },
        log: () =>
          this.logger.debug(
            `Template '${template.cuid}' still pending approval`,
          ),
      }),
    };

    const handler = statusHandlers[result.status];
    console.log('Status handler result:', handler);
    if (!handler) return;

    const { data, log } = handler();
    await this.prisma.template.update({
      where: { cuid: template.cuid },
      data,
    });
    log();
  }
}
