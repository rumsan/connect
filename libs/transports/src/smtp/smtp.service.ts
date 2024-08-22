import { Inject, Injectable } from '@nestjs/common';

import { TransportSmtpConfig } from '@rumsan/connect/types';
import { SmtpTransport } from './smtp.transport';

@Injectable()
export class SmtpService extends SmtpTransport {
  constructor(
    @Inject('SMTP_CONFIG') private readonly options: TransportSmtpConfig
  ) {
    super();
    this.init(this.options);
  }
}
