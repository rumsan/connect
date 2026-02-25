import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TemplateStatus } from '@prisma/client';
import {
  TemplateProviderFactory,
  TemplateSyncService,
  TemplateVerificationService,
} from '@rsconnect/templates';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ListTemplateDto } from './dto/list-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateVerificationService: TemplateVerificationService,
    private readonly templateProviderFactory: TemplateProviderFactory,
    private readonly templateSyncService: TemplateSyncService,
  ) {}

  async create(app: string, createTemplateDto: CreateTemplateDto) {
    this.logger.log(
      `Creating template for app ${app} with data: ${JSON.stringify(
        createTemplateDto,
      )}`,
    );
    const transport = await this.prisma.transport.findUnique({
      where: { cuid: createTemplateDto.transport },
    });

    if (!transport) {
      throw new NotFoundException(
        `Transport with ID ${createTemplateDto.transport} not found`,
      );
    }

    const requiresVerification =
      this.templateVerificationService.requiresTemplateVerification(transport);

    let externalId: string | undefined;

    if (requiresVerification) {
      // Transport requires provider verification — create via provider
      const provider = this.templateProviderFactory.create(transport);
      const result = await provider.create({ app, ...createTemplateDto });
      externalId = result.externalId;
    }

    // Save in DB — auto-approve if no verification required
    const template = await this.prisma.template.create({
      data: {
        app: transport.app,
        transportId: transport.cuid,
        name: createTemplateDto.name,
        externalId,
        status: requiresVerification
          ? TemplateStatus.PENDING
          : TemplateStatus.APPROVED,
        type: createTemplateDto.type,
        language: createTemplateDto.language || 'en',
        body: createTemplateDto.body,
      } as Prisma.TemplateUncheckedCreateInput,
    });

    // Request approval from provider if transport requires verification
    if (requiresVerification && externalId) {
      const provider = this.templateProviderFactory.create(transport);
      await provider.requestApproval(externalId, createTemplateDto.name);
    }

    return template;
  }

  async findAll(
    appId: string,
    dto: ListTemplateDto,
  ): Promise<PaginatorTypes.PaginatedResult<any>> {
    if (!appId) {
      throw new Error('App ID is required to list templates');
    }

    const where: any = {
      app: appId,
    };

    if (dto.transportId) {
      where.transportId = dto.transportId;
    }

    if (dto.status) {
      where.status = dto.status;
    }

    if (dto.type) {
      where.type = dto.type;
    }

    if (dto.name) {
      where.name = { contains: dto.name, mode: 'insensitive' };
    }

    if (dto.language) {
      where.language = dto.language;
    }

    if (dto.isActive !== undefined) {
      where.isActive = dto.isActive;
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[dto.sort || 'createdAt'] = dto.order || 'desc';

    return paginate(
      this.prisma.template,
      {
        where,
        orderBy,
        include: {
          Transport: {
            select: {
              cuid: true,
              name: true,
              type: true,
            },
          },
        },
      },
      {
        page: dto.page || 1,
        perPage: dto.perPage || 20,
      },
    );
  }

  async findOne(identifier: string) {
    const template = await this.prisma.template.findFirst({
      where: { OR: [{ cuid: identifier }, { externalId: identifier }] },
      include: {
        Transport: {
          select: {
            cuid: true,
            name: true,
            type: true,
            config: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID ${identifier} not found`);
    }

    return template;
  }

  async update(cuid: string, updateTemplateDto: UpdateTemplateDto) {
    const template = await this.findOne(cuid);

    return this.prisma.template.update({
      where: { cuid },
      data: updateTemplateDto,
    });
  }

  async remove(cuid: string) {
    const template = await this.findOne(cuid);

    // If template has external ID, we might want to delete from provider too
    // For now, we'll just soft delete by setting isActive to false
    // You can extend this to actually delete from provider if needed
    return this.prisma.template.update({
      where: { cuid },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Delete template completely (both from DB and provider if applicable)
   */
  async delete(cuid: string) {
    const template = await this.findOne(cuid);

    const transport = await this.prisma.transport.findUnique({
      where: { cuid: template.transportId },
    });

    // If transport requires verification and template has external ID, delete from provider too
    if (
      transport &&
      template.externalId &&
      this.templateVerificationService.requiresTemplateVerification(transport)
    ) {
      const provider = this.templateProviderFactory.create(transport);
      await provider.deleteTemplate(template.externalId);
    }

    return this.prisma.template.delete({
      where: { cuid },
    });
  }

  /**
   * Verify template for broadcast
   * This is a helper method that wraps the verification service
   */
  async verifyTemplateForBroadcast(
    transportId: string,
    templateName: string,
    parameters?: any[],
  ) {
    return this.templateVerificationService.verifyTemplate(
      transportId,
      templateName,
      parameters,
    );
  }

  async sync(transportId: string) {
    const transport = await this.prisma.transport.findUnique({
      where: { cuid: transportId },
    });

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    const provider = this.templateProviderFactory.create(transport);
    const result = await this.templateSyncService.syncTemplates(
      transportId,
      provider,
    );

    return {
      success: true,
      ...result,
    };
  }
}
