import { Session } from '@rsconnect/sdk/types';

export interface IDataProvider {
  getSession(cuid: string): Promise<Session>;
}
