import { Injectable } from '@nestjs/common';
import { IDataProvider } from './data-provider.interface';
import { getClient } from '@rumsan/connect/clients';
import { Session } from '@rumsan/connect/types';

@Injectable()
export class ApiProvider implements IDataProvider {
  private _client;
  constructor() {
    this._client = getClient({
      baseURL: 'http://localhost:3333/v1',
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
}
