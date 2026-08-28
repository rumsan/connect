import { Test, TestingModule } from '@nestjs/testing';
import { BroadcastStatus, TransportType } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { BroadcastReclaimWorker } from './broadcast-reclaim.worker';
import { BroadcastService } from './broadcast.service';
import { SessionAssignmentService } from './session-assignment.service';

const staleBroadcast = (overrides = {}) => ({
  cuid: 'b1',
  app: 'app-1',
  session: 's1',
  workerId: 'w1',
  attempts: 1,
  maxAttempts: 3,
  ...overrides,
});

describe('BroadcastReclaimWorker', () => {
  let worker: BroadcastReclaimWorker;
  let prisma: any;
  let broadcastService: { syncSessionCompletion: jest.Mock };
  let sessionAssignment: {
    ensureAssignment: jest.Mock;
    isMultiWorker: jest.Mock;
    clearPending: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      broadcast: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      broadcastLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      session: {
        findUnique: jest.fn().mockResolvedValue({
          cuid: 's1',
          Transport: { type: TransportType.VOICE },
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    broadcastService = { syncSessionCompletion: jest.fn().mockResolvedValue(true) };
    sessionAssignment = {
      ensureAssignment: jest.fn().mockResolvedValue([]),
      isMultiWorker: jest.fn().mockReturnValue(true),
      clearPending: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastReclaimWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: BroadcastService, useValue: broadcastService },
        { provide: SessionAssignmentService, useValue: sessionAssignment },
      ],
    }).compile();

    worker = module.get(BroadcastReclaimWorker);
  });

  afterEach(() => {
    delete process.env.BROADCAST_CLAIM_TTL_MS;
    delete process.env.BROADCAST_MAX_SESSION_AGE_MS;
  });

  describe('reclaimStaleClaims', () => {
    it('does nothing when no claim has gone stale', async () => {
      await worker.reclaimStaleClaims();

      expect(prisma.broadcast.updateMany).not.toHaveBeenCalled();
      expect(sessionAssignment.ensureAssignment).not.toHaveBeenCalled();
    });

    it('only looks at claims older than the TTL', async () => {
      process.env.BROADCAST_CLAIM_TTL_MS = '600000';
      const before = Date.now();

      await worker.reclaimStaleClaims();

      const where = prisma.broadcast.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        status: BroadcastStatus.PENDING,
        isComplete: false,
      });
      // Cut-off sits one TTL in the past, so anything a live worker could still
      // report on is left alone.
      const cutoff = where.claimedAt.lt.getTime();
      expect(before - cutoff).toBeGreaterThanOrEqual(600000);
      expect(before - cutoff).toBeLessThan(601000);
    });

    it('hands attempts-remaining broadcasts back to the pool', async () => {
      prisma.broadcast.findMany.mockResolvedValue([
        staleBroadcast({ attempts: 1, maxAttempts: 3 }),
      ]);

      await worker.reclaimStaleClaims();

      expect(prisma.broadcast.updateMany).toHaveBeenCalledWith({
        where: { cuid: { in: ['b1'] } },
        data: {
          status: BroadcastStatus.SCHEDULED,
          // Ownership must be released or no other worker can claim them.
          workerId: null,
          claimedAt: null,
        },
      });
    });

    it('fails out-of-attempts broadcasts as WORKER_LOST so the session can finish', async () => {
      prisma.broadcast.findMany.mockResolvedValue([
        staleBroadcast({ attempts: 3, maxAttempts: 3 }),
      ]);

      await worker.reclaimStaleClaims();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.broadcast.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: BroadcastStatus.FAIL,
            isComplete: true,
            disposition: expect.objectContaining({ errorTag: 'WORKER_LOST' }),
          }),
        }),
      );
      expect(broadcastService.syncSessionCompletion).toHaveBeenCalledWith('s1');
    });

    it('reassigns the session after handing work back', async () => {
      prisma.broadcast.findMany.mockResolvedValue([
        staleBroadcast({ attempts: 1, maxAttempts: 3 }),
      ]);

      await worker.reclaimStaleClaims();

      expect(sessionAssignment.ensureAssignment).toHaveBeenCalledWith(
        's1',
        TransportType.VOICE,
      );
    });

    it('does not reassign when everything was terminal', async () => {
      prisma.broadcast.findMany.mockResolvedValue([
        staleBroadcast({ attempts: 3, maxAttempts: 3 }),
      ]);

      await worker.reclaimStaleClaims();

      expect(sessionAssignment.ensureAssignment).not.toHaveBeenCalled();
    });

    it('handles a mixed sweep across several sessions', async () => {
      prisma.broadcast.findMany.mockResolvedValue([
        staleBroadcast({ cuid: 'b1', session: 's1', attempts: 1 }),
        staleBroadcast({ cuid: 'b2', session: 's2', attempts: 3 }),
      ]);

      await worker.reclaimStaleClaims();

      expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('assignStalledSessions', () => {
    it('tops up assignment for in-progress sessions with work waiting', async () => {
      prisma.session.findMany.mockResolvedValue([
        { cuid: 's1', Transport: { type: TransportType.VOICE } },
        { cuid: 's2', Transport: { type: TransportType.VOICE } },
      ]);

      await worker.assignStalledSessions();

      expect(sessionAssignment.ensureAssignment).toHaveBeenCalledWith(
        's1',
        TransportType.VOICE,
      );
      expect(sessionAssignment.ensureAssignment).toHaveBeenCalledWith(
        's2',
        TransportType.VOICE,
      );
    });

    it('skips transports that are not multi-worker', async () => {
      prisma.session.findMany.mockResolvedValue([
        { cuid: 's1', Transport: { type: TransportType.SMTP } },
      ]);
      sessionAssignment.isMultiWorker.mockReturnValue(false);

      await worker.assignStalledSessions();

      expect(sessionAssignment.ensureAssignment).not.toHaveBeenCalled();
    });

    it('keeps going when one session fails to assign', async () => {
      prisma.session.findMany.mockResolvedValue([
        { cuid: 's1', Transport: { type: TransportType.VOICE } },
        { cuid: 's2', Transport: { type: TransportType.VOICE } },
      ]);
      sessionAssignment.ensureAssignment
        .mockRejectedValueOnce(new Error('broker down'))
        .mockResolvedValueOnce(['w1']);

      await worker.assignStalledSessions();

      expect(sessionAssignment.ensureAssignment).toHaveBeenCalledTimes(2);
    });

    describe('age limit', () => {
      const cutoffOf = (call: any) => call.where.createdAt.gte.getTime();

      it('only considers sessions newer than the 24h default', async () => {
        const before = Date.now();

        await worker.assignStalledSessions();

        const cutoff = cutoffOf(prisma.session.findMany.mock.calls[0][0]);
        expect(cutoff).toBeGreaterThanOrEqual(before - 86_400_000);
        expect(cutoff).toBeLessThanOrEqual(Date.now() - 86_400_000 + 1000);
      });

      it('honours BROADCAST_MAX_SESSION_AGE_MS', async () => {
        process.env.BROADCAST_MAX_SESSION_AGE_MS = '3600000';
        const before = Date.now();

        await worker.assignStalledSessions();

        const cutoff = cutoffOf(prisma.session.findMany.mock.calls[0][0]);
        expect(cutoff).toBeGreaterThanOrEqual(before - 3_600_000);
        expect(cutoff).toBeLessThanOrEqual(Date.now() - 3_600_000 + 1000);
      });

      it('counts the skipped backlog with the mirrored cutoff', async () => {
        process.env.BROADCAST_MAX_SESSION_AGE_MS = '3600000';

        await worker.assignStalledSessions();

        const countArgs = prisma.session.count.mock.calls[0][0];
        expect(countArgs.where.createdAt.lt).toBeInstanceOf(Date);
        // Same window, opposite side — nothing falls through both.
        expect(countArgs.where.createdAt.lt.getTime()).toBeCloseTo(
          cutoffOf(prisma.session.findMany.mock.calls[0][0]),
          -3,
        );
      });

      it('never writes to an aged-out session, so retry still works', async () => {
        prisma.session.count.mockResolvedValue(11);
        prisma.session.findMany.mockResolvedValue([]);

        await worker.assignStalledSessions();

        expect(prisma.broadcast.updateMany).not.toHaveBeenCalled();
        expect(prisma.session.update).not.toHaveBeenCalled();
        expect(prisma.session.updateMany).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(sessionAssignment.ensureAssignment).not.toHaveBeenCalled();
      });
    });
  });
});
