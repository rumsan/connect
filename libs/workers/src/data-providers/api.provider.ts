import { Injectable } from '@nestjs/common';
import { getClient } from '@rumsan/connect/clients';
import { Session } from '@rumsan/connect/types';
import { IDataProvider } from './data-provider.interface';

@Injectable()
export class ApiProvider implements IDataProvider {
  private _client;
  constructor(params: { url?: string }) {
    if (!params.url) {
      throw new Error('RS Connect api url is required for DataProvider');
    }
    this._client = getClient({
      baseURL: params.url,
    });
  }

  async getSession(sessionCuid: string): Promise<Session> {
    const { data } = await this._client.session.get(sessionCuid);
    return data;
  }

  async getBroadcast(broadcastCuid: string) {
    const { data } = await this._client.broadcast.get(broadcastCuid);
    return data;
  }

  async getBroadcasts(broadcastCuids: string[]) {
    const { data } = await this._client.broadcast.listSelected(broadcastCuids);
    return data;
  }
}
