import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AdnSmsPollOptions,
  AdnSmsStatusService,
} from './adn-sms-status.service';
import { WebhookService } from './webhook.service';

@Controller('webhook')
@ApiTags('Webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly adnSmsStatusService: AdnSmsStatusService,
  ) {}

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

  // ADN SMS has no delivery callback — poll its sms-status API for any
  // still-pending broadcasts and finalize them. Trigger manually or via cron.
  @Post('adn-sms-status')
  @ApiOperation({
    summary: 'Poll ADN SMS sms-status for incomplete broadcasts',
  })
  async pollAdnSmsStatus(@Body() body: AdnSmsPollOptions = {}) {
    return this.adnSmsStatusService.poll(body);
  }
}
