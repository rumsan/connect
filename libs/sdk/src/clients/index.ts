import { AxiosHeaderValue, CreateAxiosDefaults } from 'axios';
import { SessionClient } from './session.client';
import { BroadcastLogClient } from './broadcast-log.client';
import { BroadcastClient } from './broadcast.client';
import { ApiClient } from './api.client';
import { TransportClient } from './transport.client';

export {
  ApiClient,
  SessionClient,
  BroadcastLogClient,
  BroadcastClient,
  TransportClient,
};

export const getClient = (config: CreateAxiosDefaults) => {
  const apiClient = new ApiClient(config);
  return {
    apiClient: apiClient,
    setAppId: (appId: string) => (apiClient.appId = appId),
    setAccessToken: (token: string) => (apiClient.accessToken = token),
    setHeaders: (headers: { [key: string]: AxiosHeaderValue }) =>
      (apiClient.headers = headers),
    session: new SessionClient(apiClient),
    broadcast: new BroadcastClient(apiClient),
    broadcastLog: new BroadcastLogClient(apiClient),
    transport: new TransportClient(apiClient),
  };
};
