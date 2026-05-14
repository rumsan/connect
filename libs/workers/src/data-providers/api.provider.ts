import { Injectable, Logger } from '@nestjs/common';
import { getClient } from '@rumsan/connect/clients';
import { Session } from '@rumsan/connect/types';
import { IDataProvider } from './data-provider.interface';

@Injectable()
export class ApiProvider implements IDataProvider {
  private readonly logger = new Logger(ApiProvider.name);
  private _client;
  constructor(params: { url?: string }) {
    if (!params.url) {
      throw new Error('RS Connect api url is required for DataProvider');
    }
    this._client = getClient({
      baseURL: params.url,
    });
    this.logger.log(`Initialized with API URL: ${params.url}`);
  }

  async getSession(sessionCuid: string): Promise<Session> {
    this.logger.log(`Fetching session: ${sessionCuid}`);
    try {
      const { data } = await this._client.session.get(sessionCuid);
      this.logger.log(`Successfully fetched session: ${sessionCuid}`);
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch session: ${sessionCuid}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async getBroadcast(broadcastCuid: string) {
    this.logger.log(`Fetching broadcast: ${broadcastCuid}`);
    try {
      const { data } = await this._client.broadcast.get(broadcastCuid);
      this.logger.log(`Successfully fetched broadcast: ${broadcastCuid}`);
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch broadcast: ${broadcastCuid}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async getBroadcasts(broadcastCuids: string[]) {
    this.logger.log(`Fetching ${broadcastCuids.length} broadcasts`);
    try {
      const { data } = await this._client.broadcast.listSelected(broadcastCuids);
      this.logger.log(`Successfully fetched ${data.length} broadcasts`);
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch broadcasts`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
