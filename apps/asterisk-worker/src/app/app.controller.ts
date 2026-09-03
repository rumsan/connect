import { Controller, Get } from '@nestjs/common';
import { AsteriskWorker } from '../workers/asterisk.worker';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly asteriskWorker: AsteriskWorker,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  /**
   * Identity, capacity and current load for this instance. Running a fleet
   * without this means guessing which box owns a call.
   */
  @Get('health')
  health() {
    return { status: 'ok', ...this.asteriskWorker.status };
  }
}
