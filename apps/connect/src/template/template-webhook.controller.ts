import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@rumsan/prisma';
import { TemplateService } from './template.service';

@ApiTags('template-webhooks')
@Controller('template/webhooks')
export class TemplateWebhookController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly prisma: PrismaService,

  ) {}

  /**
   * Twilio-specific webhook endpoint
   */
  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle Twilio template webhook events',
    description: 'Receives webhook events from Twilio Content API',
  })
  async handleTwilioWebhook(@Body() body: any) {
    const transport = await this.prisma.transport.findFirst({
      where: { config: { path: ['provider'], equals: 'twilio' } },
    });
     if (!transport) {
        throw new Error(`Transport not found`);
      }
    
    return this.templateService.sync(transport.cuid);

  }

  
}
