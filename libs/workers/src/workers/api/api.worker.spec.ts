import { QueueBroadcastJobData } from '@rumsan/connect/types';
import { PassThroughSessionGate } from '../session-gate';
import { ApiWorker } from './api.worker';

const jobData: QueueBroadcastJobData = {
  sessionId: 's1',
  transportId: 't1',
  broadcasts: [
    { address: '+9779800000001', broadcastLogId: 'l1', broadcastId: 'b1', attempt: 1 },
    { address: '+9779800000002', broadcastLogId: 'l2', broadcastId: 'b2', attempt: 1 },
  ],
};

describe('ApiWorker', () => {
  let worker: ApiWorker;
  let dataProvider: { getSession: jest.Mock; getBroadcasts: jest.Mock };
  let transportQueue: { confirmReadiness: jest.Mock };
  let transport: {
    init: jest.Mock;
    send: jest.Mock;
    normalizeSendOutcome: jest.Mock;
  };
  let broadcastLogQueue: { add: jest.Mock };

  beforeEach(() => {
    dataProvider = {
      getSession: jest.fn().mockResolvedValue({
        cuid: 's1',
        message: { content: 'hi' },
        Transport: { config: {} },
      }),
      getBroadcasts: jest.fn(),
    };
    transportQueue = { confirmReadiness: jest.fn().mockResolvedValue(true) };
    transport = {
      init: jest.fn(),
      send: jest.fn().mockResolvedValue({}),
      normalizeSendOutcome: jest
        .fn()
        .mockReturnValue({ status: 'SUCCESS', details: {} }),
    };
    broadcastLogQueue = { add: jest.fn().mockResolvedValue(true) };

    worker = new ApiWorker(
      dataProvider as any,
      {} as any,
      transportQueue as any,
      transport as any,
      broadcastLogQueue as any,
    );
  });

  it('asks for the next batch after a normal batch', async () => {
    await worker._sendBroadcast(jobData);

    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCuid: 's1' }),
    );
  });

  it('still asks for the next batch when the batch throws', async () => {
    // Without the confirm, connect never claims the rest of the session.
    dataProvider.getSession.mockRejectedValue(new Error('db down'));

    await worker._sendBroadcast(jobData);

    expect(transport.send).not.toHaveBeenCalled();
    expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCuid: 's1' }),
    );
  });

  it('keeps sending when one log publish fails', async () => {
    broadcastLogQueue.add.mockRejectedValueOnce(new Error('amqp down'));

    await worker._sendBroadcast(jobData);

    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(transportQueue.confirmReadiness).toHaveBeenCalledTimes(1);
  });
});

describe('PassThroughSessionGate', () => {
  it('runs work for different sessions without waiting on SESSION_COMPLETE', async () => {
    const gate = new PassThroughSessionGate();
    const ran: string[] = [];

    await gate.enqueue('s1', async () => {
      ran.push('s1');
    });
    await gate.enqueue('s2', async () => {
      ran.push('s2');
    });

    expect(ran).toEqual(['s1', 's2']);
  });

  it('swallows work errors', async () => {
    const gate = new PassThroughSessionGate();
    await expect(
      gate.enqueue('s1', async () => {
        throw new Error('boom');
      }),
    ).resolves.toBeUndefined();
  });
});
