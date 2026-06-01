import { Injectable, Logger } from '@nestjs/common';
import { TemplateProviderConfig } from '../interfaces/template-provider.interface';
import { ProviderConfigUtil } from '../utils/provider-config.util';
import axios from 'axios';

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl = 'https://api.twilio.com/2010-04-01/Accounts';

  constructor(private readonly config: TemplateProviderConfig) {
    ProviderConfigUtil.validateTwilioConfig(config);
    const credentials = ProviderConfigUtil.getTwilioCredentials(config);
    this.accountSid = credentials.username;
    this.authToken = credentials.password;
  }

  /**
   * Fetch Twilio message details from Twilio API
   */
  async fetchTwilioMessageDetails(
    messageSid: string,
  ): Promise<{ price?: string; price_unit?: string } | null> {
    if (!this.authToken) {
      this.logger.warn('Twilio authToken not found in config or env');
      return null;
    }
    try {
      const url = `${this.baseUrl}/${this.accountSid}/Messages/${messageSid}.json`;
      const res = await axios.get(url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
              'base64',
            ),
        },
      });
      return res.data;
    } catch (err: any) {
      if (err.response) {
        this.logger.warn(
          `Failed to fetch Twilio message details: ${err.response.status}`,
        );
      } else {
        this.logger.warn('Error fetching Twilio message details: ' + err);
      }
    }
    return null;
  }
}
