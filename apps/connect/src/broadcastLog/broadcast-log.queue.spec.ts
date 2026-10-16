import { QUEUES } from '@rumsan/connect';
import { BroadcastStatus } from '@rumsan/connect/types';
import { BroadcastLogQueue } from './broadcast-log.queue';

const existing = (over: { attempt: number; brAttempts: number }) => ({
  cuid: 'log-1',
  broadcast: 'b-1',
  session: 's-1',
  attempt: over.attempt,
  status: BroadcastStatus.FAIL,
  details: { disposition: 'ANSWERED', errorTag: 'ANSWERED_NO_PLAYBACK' },
  Broadcast: { attempts: over.brAttempts, maxAttempts: 3 },
});

describe('BroadcastLogQueue', () => {
  let prisma: {
    broadcastLog: { findUnique: jest.Mock; update: jest.Mock };
    broadcast: { update: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    session: { findUnique: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: BroadcastLogQueue;

  const setup = (log: ReturnType<typeof existing>) => {
    prisma = {
      broadcastLog: {
        findUnique: jest.fn().mockResolvedValue(log),
        update: jest.fn().mockResolvedValue(log),
      },
      broadcast: {
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      session: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    queue = new BroadcastLogQueue(
      prisma as never,
      {} as never,
      { emit: jest.fn() } as never,
      { closeLastRun: jest.fn() } as never,
    );
  };

  describe('update', () => {
    const report = {
      broadcastLogId: 'log-1',
      broadcastId: 'b-1',
      sessionId: 's-1',
      attempt: 1,
      status: BroadcastStatus.SUCCESS,
      queue: QUEUES.TRANSPORT_VOICE,
    };

    it('mirrors the current attempt onto the broadcast', async () => {
      setup(existing({ attempt: 1, brAttempts: 1 }));
      await queue.update(report);

      expect(prisma.broadcastLog.update).toHaveBeenCalled();
      expect(prisma.broadcast.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BroadcastStatus.SUCCESS }),
        }),
      );
    });

    it('leaves the broadcast alone for a report from an older attempt', async () => {
      setup(existing({ attempt: 1, brAttempts: 2 }));
      await queue.update(report);

      expect(prisma.broadcastLog.update).toHaveBeenCalled();
      expect(prisma.broadcast.update).not.toHaveBeenCalled();
    });
  });

  describe('updateDetails', () => {
    const cdr = {
      broadcastLogId: 'log-1',
      details: { cdrDisposition: 'ANSWERED', duration: 42 },
    };

    it('merges CDR data without touching the status the hangup set', async () => {
      setup(existing({ attempt: 1, brAttempts: 1 }));
      await queue.updateDetails(cdr);

      const logData = prisma.broadcastLog.update.mock.calls[0][0].data;
      expect(logData.status).toBeUndefined();
      expect(logData.details).toEqual(
        expect.objectContaining({
          disposition: 'ANSWERED',
          errorTag: 'ANSWERED_NO_PLAYBACK',
          duration: 42,
        }),
      );
      const broadcastData = prisma.broadcast.update.mock.calls[0][0].data;
      expect(broadcastData.status).toBeUndefined();
    });

    it('leaves the broadcast alone for details from an older attempt', async () => {
      setup(existing({ attempt: 1, brAttempts: 2 }));
      await queue.updateDetails(cdr);

      expect(prisma.broadcastLog.update).toHaveBeenCalled();
      expect(prisma.broadcast.update).not.toHaveBeenCalled();
    });
  });
});
