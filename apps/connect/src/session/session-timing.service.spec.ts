import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@rumsan/prisma';
import { SessionRun, SessionTimingService } from './session-timing.service';

type Row = {
  cuid: string;
  startedAt: Date | null;
  endedAt: Date | null;
  stats: Record<string, unknown> | null;
};

/**
 * A tiny in-memory stand-in for the one session row under test. Asserting on
 * the resulting row is far more useful here than asserting on call arguments,
 * because the behaviour that matters (first-write-wins, run open/close) is the
 * *outcome* of several statements.
 */
function makePrisma(initial: Partial<Row> = {}) {
  const row: Row = {
    cuid: 'sess-1',
    startedAt: null,
    endedAt: null,
    stats: null,
    ...initial,
  };
  let exists = true;

  const client: any = {
    session: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!exists || where.cuid !== row.cuid) return { count: 0 };
        // Honour the guarded `startedAt: null` where-clause.
        if ('startedAt' in where && where.startedAt === null && row.startedAt) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(row, data);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        exists && where.cuid === row.cuid ? { stats: row.stats } : null,
      ),
    },
    $queryRaw: jest.fn(async () => (exists ? [{ stats: row.stats }] : [])),
    $transaction: jest.fn(async (fn: any) => fn(client)),
  };

  return { client, row, remove: () => (exists = false) };
}

const runs = (row: Row): SessionRun[] =>
  ((row.stats?.runs as SessionRun[]) ?? []);

describe('SessionTimingService', () => {
  const build = async (prisma: any) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionTimingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return module.get<SessionTimingService>(SessionTimingService);
  };

  const T1 = new Date('2026-08-13T10:00:00.000Z');
  const T2 = new Date('2026-08-13T10:20:00.000Z');
  const T3 = new Date('2026-08-13T14:00:00.000Z');
  const T4 = new Date('2026-08-13T14:12:00.000Z');

  it('should be defined', async () => {
    const { client } = makePrisma();
    expect(await build(client)).toBeDefined();
  });

  describe('markStarted', () => {
    it('sets startedAt and opens the initial run', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.markStarted('sess-1', T1);

      expect(row.startedAt).toEqual(T1);
      expect(runs(row)).toEqual([
        { trigger: 'initial', startedAt: T1.toISOString(), endedAt: null },
      ]);
    });

    it('is first-write-wins and does not append a second run', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.markStarted('sess-1', T1);
      // The voice batch loop re-confirms readiness many times per run.
      await service.markStarted('sess-1', T2);

      expect(row.startedAt).toEqual(T1);
      expect(runs(row)).toHaveLength(1);
      expect(runs(row)[0].startedAt).toBe(T1.toISOString());
    });

    it('preserves other keys already in stats', async () => {
      const { client, row } = makePrisma({ stats: { totalAudience: 42 } });
      const service = await build(client);

      await service.markStarted('sess-1', T1);

      expect(row.stats?.totalAudience).toBe(42);
      expect(runs(row)).toHaveLength(1);
    });
  });

  describe('markEnded', () => {
    it('sets endedAt and closes the open run', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.markStarted('sess-1', T1);
      await service.markEnded('sess-1', T2);

      expect(row.endedAt).toEqual(T2);
      expect(runs(row)).toEqual([
        {
          trigger: 'initial',
          startedAt: T1.toISOString(),
          endedAt: T2.toISOString(),
        },
      ]);
    });

    it('is last-write-wins', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.markStarted('sess-1', T1);
      await service.markEnded('sess-1', T2);
      await service.markEnded('sess-1', T3);

      expect(row.endedAt).toEqual(T3);
      expect(runs(row)[0].endedAt).toBe(T3.toISOString());
    });
  });

  describe('retry', () => {
    it('opens a run with a null start that the transport later fills', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      // First run.
      await service.markStarted('sess-1', T1);
      await service.markEnded('sess-1', T2);

      // Retry: the run opens before we know when the worker will pick it up.
      await service.openRun('sess-1', 'retry');
      expect(runs(row)[1]).toEqual({
        trigger: 'retry',
        startedAt: null,
        endedAt: null,
      });

      // The worker reports in — fills the open run, leaves the column alone.
      await service.markStarted('sess-1', T3);
      await service.markEnded('sess-1', T4);

      expect(row.startedAt).toEqual(T1); // lifetime span: never reset
      expect(row.endedAt).toEqual(T4);
      expect(runs(row)).toEqual([
        {
          trigger: 'initial',
          startedAt: T1.toISOString(),
          endedAt: T2.toISOString(),
        },
        {
          trigger: 'retry',
          startedAt: T3.toISOString(),
          endedAt: T4.toISOString(),
        },
      ]);
    });

    it('does not open a run when nothing retried it', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.markStarted('sess-1', T1);
      await service.markEnded('sess-1', T2);
      // A stray late report with no retry in between.
      await service.markStarted('sess-1', T3);

      expect(runs(row)).toHaveLength(1);
    });

    it('caps the history at 50 runs, dropping the oldest', async () => {
      const seeded: SessionRun[] = Array.from({ length: 50 }, (_, i) => ({
        trigger: 'retry' as const,
        startedAt: `seed-${i}`,
        endedAt: `seed-${i}`,
      }));
      const { client, row } = makePrisma({ stats: { runs: seeded } });
      const service = await build(client);

      await service.openRun('sess-1', 'retry');

      expect(runs(row)).toHaveLength(50);
      expect(runs(row)[0].startedAt).toBe('seed-1'); // seed-0 dropped
      expect(runs(row)[49]).toEqual({
        trigger: 'retry',
        startedAt: null,
        endedAt: null,
      });
    });
  });

  describe('resilience', () => {
    it('no-ops for a missing session instead of throwing', async () => {
      const { client, remove } = makePrisma();
      const service = await build(client);
      remove();

      await expect(service.markStarted('gone', T1)).resolves.toBeUndefined();
      await expect(service.markEnded('gone', T2)).resolves.toBeUndefined();
      await expect(service.openRun('gone', 'retry')).resolves.toBeUndefined();
      await expect(service.closeLastRun('gone', T2)).resolves.toBeUndefined();
    });

    it('closeLastRun no-ops when there is no history', async () => {
      const { client, row } = makePrisma();
      const service = await build(client);

      await service.closeLastRun('sess-1', T2);

      expect(runs(row)).toEqual([]);
    });

    it('swallows db errors so timing never breaks the caller', async () => {
      const { client } = makePrisma();
      client.session.updateMany.mockRejectedValue(new Error('db down'));
      client.$transaction.mockRejectedValue(new Error('db down'));
      const service = await build(client);

      await expect(service.markStarted('sess-1', T1)).resolves.toBeUndefined();
      await expect(service.markEnded('sess-1', T2)).resolves.toBeUndefined();
      await expect(service.openRun('sess-1', 'retry')).resolves.toBeUndefined();
    });
  });
});
