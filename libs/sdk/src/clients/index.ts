import { AxiosHeaderValue, CreateAxiosDefaults } from 'axios';
import { ApiClient } from './api.client';
import { BroadcastLogClient } from './broadcast-log.client';
import { BroadcastClient } from './broadcast.client';
import { SessionClient } from './session.client';
import { TransportClient } from './transport.client';
import { TemplateClient } from './template.client';

export {
  ApiClient,
  BroadcastClient,
  BroadcastLogClient,
  SessionClient,
  TransportClient,
  TemplateClient,
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
    template: new TemplateClient(apiClient),
  };
};
