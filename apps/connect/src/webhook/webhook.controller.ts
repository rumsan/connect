import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@Controller('webhook')
@ApiTags('Webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('message-status')
  @ApiOperation({
    summary: 'Receive provider message status callbacks',
  })
  async create(@Body() body: any) {
    return this.webhookService.handleMessageStatusWebhook(body);
  }
}
