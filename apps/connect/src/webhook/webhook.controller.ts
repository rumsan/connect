import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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

  // Plasgate  sends DLR callbacks as GET with the report in the query
  @Get('plasgate')
  @ApiOperation({
    summary: 'Receive Plasgate DLR (delivery report) callbacks',
  })
  async plasgateDlrGet(@Query() query: any) {
    return this.webhookService.handlePlasgateDlrWebhook(query);
  }
}
