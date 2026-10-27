import { UsageService } from './usage.service';

const snapshot = (over: {
  transportCuid: string;
  createdAt: string;
  updatedAt: string;
}) => ({
  transportCuid: over.transportCuid,
  transportType: 'API',
  date: new Date('2026-10-01'),
  sessionCount: 1,
  broadcastCount: 2,
  successCount: 2,
  failCount: 0,
  totalCharacters: 0,
  totalSegments: 0,
  totalDurationSec: 0,
  totalCalls: 2,
  creditsUsed: 1,
  sessionCuids: ['s1'],
  createdAt: new Date(over.createdAt),
  updatedAt: new Date(over.updatedAt),
});

describe('UsageService dates', () => {
  let prisma: {
    usageSnapshot: { findMany: jest.Mock };
    transport: { findMany: jest.Mock };
  };
  let service: UsageService;

  beforeEach(() => {
    prisma = {
      usageSnapshot: { findMany: jest.fn() },
      transport: {
        findMany: jest.fn().mockResolvedValue([
          { cuid: 't1', name: 'SMS', type: 'API' },
          { cuid: 't2', name: 'Voice', type: 'VOICE' },
        ]),
      },
    };
    service = new UsageService(prisma as never);
  });

  it('reports when usage was first recorded and last updated, overall and per transport', async () => {
    prisma.usageSnapshot.findMany.mockResolvedValue([
      snapshot({ transportCuid: 't1', createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-03T10:00:00Z' }),
      snapshot({ transportCuid: 't1', createdAt: '2026-10-02T08:00:00Z', updatedAt: '2026-10-02T09:00:00Z' }),
      snapshot({ transportCuid: 't2', createdAt: '2026-09-30T08:00:00Z', updatedAt: '2026-10-05T12:00:00Z' }),
    ]);

    const usage = await service.getUsage('app', '');

    expect(usage.firstRecordedAt).toEqual(new Date('2026-09-30T08:00:00Z'));
    expect(usage.lastUpdatedAt).toEqual(new Date('2026-10-05T12:00:00Z'));
    const t1 = usage.byTransport.find((t) => t.transportCuid === 't1');
    expect(t1.firstRecordedAt).toEqual(new Date('2026-10-01T08:00:00Z'));
    expect(t1.lastUpdatedAt).toEqual(new Date('2026-10-03T10:00:00Z'));
  });

  it('returns null dates when the range holds no usage', async () => {
    prisma.usageSnapshot.findMany.mockResolvedValue([]);

    const usage = await service.getUsage('app', '');

    expect(usage.firstRecordedAt).toBeNull();
    expect(usage.lastUpdatedAt).toBeNull();
  });

  it('includes createdAt and updatedAt on every credits row', async () => {
    prisma.usageSnapshot.findMany
      .mockResolvedValueOnce([{ transportCuid: 't1' }])
      .mockResolvedValueOnce([
        snapshot({ transportCuid: 't1', createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-03T10:00:00Z' }),
      ]);

    const [row] = await service.getCredits('app', '');

    expect(row.createdAt).toEqual(new Date('2026-10-01T08:00:00Z'));
    expect(row.updatedAt).toEqual(new Date('2026-10-03T10:00:00Z'));
  });
});
