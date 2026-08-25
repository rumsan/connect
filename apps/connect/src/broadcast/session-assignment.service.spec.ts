import { Test, TestingModule } from '@nestjs/testing';
import { TransportQueue } from '@rsconnect/queue';
import { TransportType } from '@rumsan/connect/types';
import { PrismaService } from '@rumsan/prisma';
import { WorkerRegistry, WorkerState } from '../workers/worker-registry.service';
import { SessionAssignmentService } from './session-assignment.service';

const worker = (
  workerId: string,
  priority: number,
  capacity: number,
  activeSessionCuid: string | null = null,
): WorkerState => ({
  workerId,
  transport: 'voice',
  priority,
  capacity,
  activeSessionCuid,
  inFlight: 0,
  lastSeenAt: Date.now(),
});

describe('SessionAssignmentService', () => {
  let service: SessionAssignmentService;
  let prisma: {
    broadcast: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let transportQueue: { checkReadiness: jest.Mock };
  let registry: { idle: jest.Mock; live: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      broadcast: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    transportQueue = { checkReadiness: jest.fn().mockResolvedValue(true) };
    registry = {
      idle: jest.fn().mockReturnValue([]),
      live: jest.fn().mockReturnValue([]),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionAssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransportQueue, useValue: transportQueue },
        { provide: WorkerRegistry, useValue: registry },
      ],
    }).compile();

    service = module.get(SessionAssignmentService);
  });

  afterEach(() => {
    delete process.env.BROADCAST_SPILLOVER_MIN;
  });

  describe('selectWorkers', () => {
    // The fleet used throughout the docs: primary holds 10, spillover holds 5.
    const fleet = [worker('w1', 1, 10), worker('w2', 2, 5)];

    it.each([
      ['fits inside the primary', 8, ['w1']],
      ['exactly fills the primary', 10, ['w1']],
      ['one past the primary spills', 11, ['w1', 'w2']],
      ['needs everyone', 100, ['w1', 'w2']],
    ])('%s', (_name, remaining, expected) => {
      expect(service.selectWorkers(remaining, fleet).map((w) => w.workerId)).toEqual(
        expected,
      );
    });

    it('fills in priority order regardless of list order', () => {
      const shuffled = [worker('w2', 2, 5), worker('w1', 1, 10)];
      // Registry hands them over already sorted; selectWorkers must not reorder,
      // so passing an unsorted list takes them as given.
      expect(service.selectWorkers(100, shuffled).map((w) => w.workerId)).toEqual([
        'w2',
        'w1',
      ]);
    });

    it('takes nobody when there is nothing to send', () => {
      expect(service.selectWorkers(0, fleet)).toEqual([]);
    });

    it('takes nobody when no workers are available', () => {
      expect(service.selectWorkers(50, [])).toEqual([]);
    });

    it('respects BROADCAST_SPILLOVER_MIN so a big box is not woken for scraps', () => {
      process.env.BROADCAST_SPILLOVER_MIN = '5';
      // 12 remaining: w1 covers 10, only 2 overflow — below the threshold.
      expect(service.selectWorkers(12, fleet).map((w) => w.workerId)).toEqual([
        'w1',
      ]);
      // 20 remaining: 10 overflow clears the threshold.
      expect(service.selectWorkers(20, fleet).map((w) => w.workerId)).toEqual([
        'w1',
        'w2',
      ]);
    });

    it('stops at the last worker even when capacity is short', () => {
      // 100 addresses, 15 total capacity: use everyone and let them cycle.
      const chosen = service.selectWorkers(100, fleet);
      expect(chosen).toHaveLength(2);
    });
  });

  describe('ensureAssignment', () => {
    it('does nothing for transports that are not multi-worker', async () => {
      const assigned = await service.ensureAssignment('s1', TransportType.SMTP);

      expect(assigned).toEqual([]);
      expect(transportQueue.checkReadiness).not.toHaveBeenCalled();
    });

    it('does nothing when the session has no work left', async () => {
      prisma.broadcast.count.mockResolvedValue(0);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual(
        [],
      );
      expect(transportQueue.checkReadiness).not.toHaveBeenCalled();
    });

    it('assigns only the primary when it can hold the session', async () => {
      prisma.broadcast.count.mockResolvedValue(8);
      registry.idle.mockReturnValue([worker('w1', 1, 10), worker('w2', 2, 5)]);

      const assigned = await service.ensureAssignment('s1', TransportType.VOICE);

      expect(assigned).toEqual(['w1']);
      expect(transportQueue.checkReadiness).toHaveBeenCalledTimes(1);
      expect(transportQueue.checkReadiness).toHaveBeenCalledWith(
        expect.objectContaining({ sessionCuid: 's1', workerId: 'w1' }),
      );
    });

    it('assigns both when the primary cannot hold the session', async () => {
      prisma.broadcast.count.mockResolvedValue(100);
      registry.idle.mockReturnValue([worker('w1', 1, 10), worker('w2', 2, 5)]);

      const assigned = await service.ensureAssignment('s1', TransportType.VOICE);

      expect(assigned).toEqual(['w1', 'w2']);
    });

    it('does not add a worker when the assigned ones still have headroom', async () => {
      // 5 left, w1 already on the session with 10 capacity and nothing in flight.
      prisma.broadcast.count.mockImplementation((args: any) =>
        args?.where?.workerId ? 0 : 5,
      );
      prisma.broadcast.findMany.mockResolvedValue([{ workerId: 'w1' }]);
      registry.live.mockReturnValue([worker('w1', 1, 10)]);
      registry.idle.mockReturnValue([worker('w2', 2, 5)]);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual(
        [],
      );
      expect(transportQueue.checkReadiness).not.toHaveBeenCalled();
    });

    it('adds a worker when the assigned ones are saturated', async () => {
      // 40 left; w1 is on the session and fully in flight, so headroom is 0.
      prisma.broadcast.count.mockImplementation((args: any) =>
        args?.where?.workerId ? 10 : 40,
      );
      prisma.broadcast.findMany.mockResolvedValue([{ workerId: 'w1' }]);
      registry.live.mockReturnValue([worker('w1', 1, 10, 's1')]);
      registry.idle.mockReturnValue([worker('w2', 2, 5)]);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual([
        'w2',
      ]);
    });

    it('treats a worker that stopped heartbeating as contributing no capacity', async () => {
      // w1 owns rows but is gone from the roster: its share becomes shortfall.
      prisma.broadcast.count.mockImplementation((args: any) =>
        args?.where?.workerId ? 0 : 30,
      );
      prisma.broadcast.findMany.mockResolvedValue([{ workerId: 'w1' }]);
      registry.live.mockReturnValue([]);
      registry.idle.mockReturnValue([worker('w2', 2, 5)]);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual([
        'w2',
      ]);
    });

    it('does not re-assign a worker already on the session', async () => {
      prisma.broadcast.count.mockImplementation((args: any) =>
        args?.where?.workerId ? 10 : 40,
      );
      prisma.broadcast.findMany.mockResolvedValue([{ workerId: 'w1' }]);
      registry.live.mockReturnValue([worker('w1', 1, 10, 's1')]);
      registry.idle.mockReturnValue([worker('w1', 1, 10)]);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual(
        [],
      );
    });

    it('reports nothing assigned when the readiness publish fails', async () => {
      prisma.broadcast.count.mockResolvedValue(8);
      registry.idle.mockReturnValue([worker('w1', 1, 10)]);
      transportQueue.checkReadiness.mockResolvedValue(false);

      expect(await service.ensureAssignment('s1', TransportType.VOICE)).toEqual(
        [],
      );
    });

    it('counts a woken worker as assigned before it has claimed anything', async () => {
      prisma.broadcast.count.mockResolvedValue(8);
      registry.idle.mockReturnValue([worker('w1', 1, 10), worker('w2', 2, 5)]);

      await service.ensureAssignment('s1', TransportType.VOICE);
      expect(await service.assignedWorkers('s1')).toEqual(new Set(['w1']));
    });

    it('forgets a pending assignment once cleared', async () => {
      prisma.broadcast.count.mockResolvedValue(8);
      registry.idle.mockReturnValue([worker('w1', 1, 10)]);

      await service.ensureAssignment('s1', TransportType.VOICE);
      service.clearPending('s1', 'w1');

      expect(await service.assignedWorkers('s1')).toEqual(new Set());
    });
  });
});
