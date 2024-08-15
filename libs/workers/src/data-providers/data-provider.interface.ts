import { Broadcast, Session } from '@rumsan/connect/types';

export interface IDataProvider {
  getSession(sessionCuid: string): Promise<Session>;
  getBroadcast(broadcastCuid: string): Promise<Broadcast>;
}
