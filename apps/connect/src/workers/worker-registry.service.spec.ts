import { QueueWorkerHeartbeat } from '@rumsan/connect/types';
import { WorkerRegistry } from './worker-registry.service';

const beat = (
  workerId: string,
  overrides: Partial<QueueWorkerHeartbeat> = {},
): QueueWorkerHeartbeat => ({
  workerId,
  transport: 'voice',
  priority: 1,
  capacity: 10,
  activeSessionCuid: null,
  inFlight: 0,
  ...overrides,
});

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = new WorkerRegistry();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('orders workers by priority, then id, so fill order is stable', () => {
    registry.record(beat('w3', { priority: 2 }));
    registry.record(beat('w1', { priority: 1 }));
    registry.record(beat('w2', { priority: 2 }));

    expect(registry.live('voice').map((w) => w.workerId)).toEqual([
      'w1',
      'w2',
      'w3',
    ]);
  });

  it('separates workers by transport', () => {
    registry.record(beat('voice-1'));
    registry.record(beat('api-1', { transport: 'api' }));

    expect(registry.live('voice').map((w) => w.workerId)).toEqual(['voice-1']);
    expect(registry.live('api').map((w) => w.workerId)).toEqual(['api-1']);
  });

  it('excludes workers already holding a session from the idle set', () => {
    registry.record(beat('w1', { activeSessionCuid: 'session-a' }));
    registry.record(beat('w2', { priority: 2 }));

    expect(registry.idle('voice').map((w) => w.workerId)).toEqual(['w2']);
  });

  it('drops a worker after three missed heartbeats', () => {
    registry.record(beat('w1'));
    expect(registry.live('voice')).toHaveLength(1);

    // Two intervals: still within tolerance.
    jest.advanceTimersByTime(30_000);
    expect(registry.live('voice')).toHaveLength(1);

    // Past the third.
    jest.advanceTimersByTime(16_000);
    expect(registry.live('voice')).toHaveLength(0);
  });

  it('keeps a worker alive while it keeps heartbeating', () => {
    registry.record(beat('w1'));

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(15_000);
      registry.record(beat('w1'));
    }

    expect(registry.live('voice')).toHaveLength(1);
  });

  it('takes the latest capacity and load from each heartbeat', () => {
    registry.record(beat('w1', { capacity: 10, inFlight: 0 }));
    registry.record(
      beat('w1', { capacity: 20, inFlight: 7, activeSessionCuid: 's1' }),
    );

    expect(registry.get('w1')).toMatchObject({
      capacity: 20,
      inFlight: 7,
      activeSessionCuid: 's1',
    });
    expect(registry.live('voice')).toHaveLength(1);
  });
});
