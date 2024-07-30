import { Injectable } from '@nestjs/common';

import {
  EmailMessage,
  IService,
  TransportSmtpConfig,
} from '@rsconnect/sdk/types';
import { createTransport, Transporter } from 'nodemailer';
import { MailOptions } from 'nodemailer/lib/json-transport';

@Injectable()
export class SmtpTransport implements IService {
  private mailer: Transporter;

  init(config: TransportSmtpConfig): void {
    this.mailer = createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure || false,
      auth: {
        user: config.username,
        pass: config.password,
      },
      from: config.defaultFrom,
      subject: config.defaultSubject,
    });
  }

  async send(address: string, message: EmailMessage) {
    const payload: MailOptions = {
      to: address,
      html: message.content,
    };
    if (message.meta.subject) {
      payload.subject = message.meta.subject;
    }
    if (message.meta.from) {
      payload.from = message.meta.from;
    }
    if (message.meta.cc) {
      payload.cc = message.meta.cc;
    }
    if (message.meta.bcc) {
      payload.bcc = message.meta.bcc;
    }

    return this.mailer.sendMail(payload);
  }
}
