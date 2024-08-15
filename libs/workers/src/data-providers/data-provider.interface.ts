import { Broadcast, Session } from '@rsconnect/sdk/types';

export interface IDataProvider {
  getSession(sessionCuid: string): Promise<Session>;
  getBroadcast(broadcastCuid: string): Promise<Broadcast>;
}
