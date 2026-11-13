import { BroadcastStatus, SessionStatus } from '@rumsan/connect/types';
import { BroadcastService } from './broadcast.service';

/**
 * READINESS_FAIL: a worker could not prepare a session and never will (its
 * audio URL is unreachable). The session must end FAILED with the reason, its
 * broadcasts must fail, and no worker may stay reserved on it — otherwise it
 * blocks every session queued behind it.
 */
describe('BroadcastService.failUnpreparableSession', () => {
  const failure = {
    sessionCuid: 's1',
    workerId: 'w1',
    errorTag: 'AUDIO_UNAVAILABLE',
    reason: 'Audio not accessible at https://x/a.mp3: HTTP 400 Bad Request',
  };

  let prisma: any;
  let tx: any;
  let transportQueue: { notifySessionComplete: jest.Mock };
  let sessionAssignment: {
    release: jest.Mock;
    assignedWorkers: jest.Mock;
    assignWaiting: jest.Mock;
  };
  let sessionTiming: { closeLastRun: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let service: BroadcastService;

  const session = (status = SessionStatus.PENDING) => ({
    cuid: 's1',
    status,
    stats: { runs: [{ trigger: 'initial', startedAt: 't0' }] },
    Transport: { type: 'VOICE' },
  });

  beforeEach(() => {
    tx = {
      broadcast: { updateMany: jest.fn() },
      broadcastLog: { createMany: jest.fn() },
      session: { update: jest.fn() },
    };
    prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session()) },
      broadcast: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([
          { cuid: 'b1', app: 'a', attempts: 0 },
          { cuid: 'b2', app: 'a', attempts: 1 },
        ]),
      },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    transportQueue = { notifySessionComplete: jest.fn() };
    sessionAssignment = {
      release: jest.fn(),
      assignedWorkers: jest.fn().mockReturnValue(new Set()),
      assignWaiting: jest.fn().mockResolvedValue(undefined),
    };
    sessionTiming = { closeLastRun: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    service = new BroadcastService(
      {} as any,
      prisma,
      transportQueue as any,
      {} as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      {} as any,
      sessionAssignment as any,
      sessionTiming as any,
    );
  });

  it('fails every outstanding broadcast with the reason', async () => {
    await service.failUnpreparableSession(failure);

    expect(tx.broadcast.updateMany).toHaveBeenCalledWith({
      where: { session: 's1', isComplete: false },
      data: {
        status: BroadcastStatus.FAIL,
        isComplete: true,
        disposition: { error: failure.reason, errorTag: 'AUDIO_UNAVAILABLE' },
      },
    });
    const logs = tx.broadcastLog.createMany.mock.calls[0][0].data;
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      broadcast: 'b1',
      status: BroadcastStatus.FAIL,
      details: { errorTag: 'AUDIO_UNAVAILABLE', workerId: 'w1' },
    });
  });

  it('marks the session FAILED with the reason in stats.failure', async () => {
    await service.failUnpreparableSession(failure);

    const { data } = tx.session.update.mock.calls[0][0];
    expect(data.status).toBe(SessionStatus.FAILED);
    expect(data.endedAt).toBeInstanceOf(Date);
    expect(data.stats.runs).toHaveLength(1);
    expect(data.stats.failure).toMatchObject({
      errorTag: 'AUDIO_UNAVAILABLE',
      reason: failure.reason,
      workerId: 'w1',
    });
    expect(sessionTiming.closeLastRun).toHaveBeenCalledWith('s1', data.endedAt, tx);
    expect(eventEmitter.emit).toHaveBeenCalledWith('broadcast.session.completed', 's1');
  });

  it('frees the reporter and every other worker on the session, then reassigns', async () => {
    sessionAssignment.assignedWorkers.mockReturnValue(new Set(['w2']));

    await service.failUnpreparableSession(failure);

    expect(sessionAssignment.release).toHaveBeenCalledWith('w1', 's1');
    expect(sessionAssignment.release).toHaveBeenCalledWith('w2', 's1');
    // The reporter already released its own gate; only w2 needs telling.
    expect(transportQueue.notifySessionComplete).toHaveBeenCalledTimes(1);
    expect(transportQueue.notifySessionComplete).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCuid: 's1', workerId: 'w2' }),
    );
    expect(sessionAssignment.assignWaiting).toHaveBeenCalled();
  });

  it('only releases the reporter when another worker is already dialling', async () => {
    prisma.broadcast.count.mockResolvedValue(3);

    await service.failUnpreparableSession(failure);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sessionAssignment.release).toHaveBeenCalledWith('w1', 's1');
    expect(sessionAssignment.assignWaiting).toHaveBeenCalled();
  });

  it('is a no-op on a session that already ended (second reporter)', async () => {
    prisma.session.findUnique.mockResolvedValue(session(SessionStatus.FAILED));

    await service.failUnpreparableSession({ ...failure, workerId: 'w2' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(sessionAssignment.release).toHaveBeenCalledWith('w2', 's1');
  });

  it('does not revive a FAILED session on a scheduled readiness check', async () => {
    prisma.session.findUnique.mockResolvedValue({ status: SessionStatus.FAILED });
    (sessionAssignment as any).isMultiWorker = jest.fn();

    await service.checkTransportReadiness('s1', 'VOICE' as any);

    expect((sessionAssignment as any).isMultiWorker).not.toHaveBeenCalled();
  });
});
