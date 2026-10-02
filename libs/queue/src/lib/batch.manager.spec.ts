import { BroadcastStatus, QueueBroadcastLog } from '@rumsan/connect/types';
import { QUEUES } from '@rumsan/connect';
import { BatchManger } from './batch.manager';
import { TransportQueue } from './transport.queue';

const log = (id: string, sessionId = 's1'): QueueBroadcastLog => ({
  queue: QUEUES.TRANSPORT_VOICE,
  broadcastLogId: id,
  broadcastId: `b-${id}`,
  sessionId,
  attempt: 1,
  status: BroadcastStatus.PENDING,
});

describe('BatchManger', () => {
  let transportQueue: { confirmReadiness: jest.Mock };
  let manager: BatchManger;

  beforeEach(() => {
    jest.useFakeTimers();
    transportQueue = { confirmReadiness: jest.fn().mockResolvedValue(true) };
    manager = new BatchManger(transportQueue as unknown as TransportQueue);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Let the batchDelay timer fire. */
  const flush = () => jest.advanceTimersByTime(manager.batchDelay + 1);

  it('asks for more work once the batch drains', () => {
    manager.beginBatch();
    manager.startMonitoring('c1', log('c1'));
    manager.startMonitoring('c2', log('c2'));
    manager.finishBatch('s1');

    manager.endMonitoring('c1');
    flush();
    expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();

    manager.endMonitoring('c2');
    flush();
    expect(transportQueue.confirmReadiness).toHaveBeenCalledTimes(1);
    expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCuid: 's1' }),
    );
  });

  it('does not ask for more work while the batch is still being dispatched', () => {
    // A broadcast that fails immediately would otherwise empty the map before
    // the rest of the batch has even been handed to the transport, and we would
    // be given a second batch on top of the one still going out.
    manager.beginBatch();
    manager.startMonitoring('c1', log('c1'));
    manager.endMonitoring('c1');
    flush();

    expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();

    manager.startMonitoring('c2', log('c2'));
    manager.finishBatch('s1');
    manager.endMonitoring('c2');
    flush();

    expect(transportQueue.confirmReadiness).toHaveBeenCalledTimes(1);
  });

  it('still asks for more work when every broadcast failed before dispatch', () => {
    // Nothing was ever monitored — without the fallback this worker would go
    // silent for the rest of the session.
    manager.beginBatch();
    manager.endMonitoring('c1', { sessionCuid: 's1' });
    manager.finishBatch('s1');
    flush();

    expect(transportQueue.confirmReadiness).toHaveBeenCalledTimes(1);
    expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCuid: 's1' }),
    );
  });

  it('ignores an unknown broadcast when no fallback context is given', () => {
    // Echo/SMTP call endMonitoring without ever calling startMonitoring; with
    // no session to name there is nothing to confirm readiness for.
    manager.endMonitoring('never-seen');
    flush();

    expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();
  });

  it('sends its workerId so connect can address the next batch back', () => {
    manager.beginBatch();
    manager.startMonitoring('c1', log('c1'));
    manager.finishBatch('s1');
    manager.endMonitoring('c1');
    flush();

    expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: manager.workerId,
        maxBatchSize: manager.batchSize,
      }),
    );
  });

  describe('with a session gate', () => {
    let active: string | null;

    beforeEach(() => {
      active = 's1';
      manager.setActiveSessionResolver(() => active);
    });

    it('does not ask for a session the gate has already left', () => {
      manager.beginBatch();
      manager.startMonitoring('c1', log('c1', 's1'));
      manager.finishBatch('s1');

      // Gate moved on (e.g. timed out) while an s1 call was still up.
      active = 's2';
      manager.endMonitoring('c1');
      flush();

      expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();
    });

    it('counts only the active session when deciding the batch drained', () => {
      manager.startMonitoring('old', log('old', 's1'));
      active = 's2';

      manager.beginBatch();
      manager.startMonitoring('c1', log('c1', 's2'));
      manager.finishBatch('s2');
      manager.endMonitoring('c1');
      flush();

      // The lingering s1 call does not hold up s2's next batch.
      expect(transportQueue.confirmReadiness).toHaveBeenCalledTimes(1);
      expect(transportQueue.confirmReadiness).toHaveBeenCalledWith(
        expect.objectContaining({ sessionCuid: 's2' }),
      );
    });

    it('drops a confirm when the gate moves on during batchDelay', () => {
      manager.beginBatch();
      manager.startMonitoring('c1', log('c1', 's1'));
      manager.finishBatch('s1');
      manager.endMonitoring('c1');

      active = null;
      flush();

      expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();
    });

    it('reports in-flight per session', () => {
      manager.startMonitoring('a', log('a', 's1'));
      manager.startMonitoring('b', log('b', 's2'));

      expect(manager.inFlightFor('s1')).toBe(1);
      expect(manager.inFlightFor()).toBe(2);
    });
  });
});
