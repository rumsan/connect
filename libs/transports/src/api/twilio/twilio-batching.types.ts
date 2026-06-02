import { TransportType } from '@rumsan/connect/types';

export const TWILIO_BATCHING_BROADCAST_PORT =
  'TWILIO_BATCHING_BROADCAST_PORT';

export interface TwilioBatchingBroadcastPort {
  checkTransportReadiness(
    sessionCuid: string,
    transportType: TransportType,
  ): void | Promise<void>;
}