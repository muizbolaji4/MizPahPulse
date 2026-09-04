/**
 * Tests for GET /api/v1/stats (issue #13).
 *
 * Focuses on the new `topAccounts` field: the five most active accounts by
 * event count. `vi.resetModules()` is used between tests because the route
 * keeps a module-level 30s cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextResponse } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  event: {
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock('@mizpah-pulse/database', () => ({
  prisma: prismaMock,
  default: prismaMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ limited: false, headers: {}, response: null })),
}));

vi.mock('@/lib/api-key', () => ({
  requireApiKey: vi.fn(async () => ({ response: null })),
}));

let GET: (req: Request, ctx?: unknown) => Promise<NextResponse>;

async function loadRoute() {
  vi.resetModules();
  const mod = await import('@/app/api/v1/stats/route');
  GET = mod.GET;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await loadRoute();

  prismaMock.event.count.mockResolvedValue(100);
  prismaMock.event.findMany.mockResolvedValue([]);
  prismaMock.event.groupBy.mockImplementation((args: { by: string[]; _count?: unknown }) => {
    if (args.by[0] === 'contractId') return Promise.resolve([{ contractId: 'C1' }]);
    // Top-accounts aggregation: `_count: { accountId: true }`.
    if (args.by[0] === 'accountId' && args._count) {
      return Promise.resolve([
        { accountId: 'GABC', _count: { accountId: 120 } },
        { accountId: 'GDEF', _count: { accountId: 90 } },
        { accountId: 'GHIJ', _count: { accountId: 45 } },
        { accountId: 'GKLM', _count: { accountId: 12 } },
        { accountId: 'GNOP', _count: { accountId: 3 } },
      ]);
    }
    // Unique-accounts aggregation: `_count: true`, `take: 1`.
    return Promise.resolve([{ accountId: 'GABC', _count: 5 }]);
  });
});

function statsRequest() {
  return GET(new Request('http://localhost:3000/api/v1/stats'));
}

describe('GET /api/v1/stats', () => {
  it('includes the five most active accounts with event counts', async () => {
    const res = await statsRequest();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.topAccounts).toEqual([
      { accountId: 'GABC', count: 120 },
      { accountId: 'GDEF', count: 90 },
      { accountId: 'GHIJ', count: 45 },
      { accountId: 'GKLM', count: 12 },
      { accountId: 'GNOP', count: 3 },
    ]);
    // Queried with a cap of five, ordered by count descending.
    expect(prismaMock.event.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['accountId'],
        where: { accountId: { not: null } },
        take: 5,
        orderBy: { _count: { accountId: 'desc' } },
      }),
    );
  });

  it('returns an empty top-accounts list when nothing has been indexed', async () => {
    prismaMock.event.groupBy.mockImplementation((args: { by: string[]; _count?: unknown }) => {
      if (args.by[0] === 'contractId') return Promise.resolve([]);
      if (args.by[0] === 'accountId' && args._count) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const res = await statsRequest();
    const body = await res.json();
    expect(body.data.topAccounts).toEqual([]);
  });

  it('strips null account ids from the aggregation', async () => {
    prismaMock.event.groupBy.mockImplementation((args: { by: string[]; _count?: unknown }) => {
      if (args.by[0] === 'contractId') return Promise.resolve([{ contractId: 'C1' }]);
      if (args.by[0] === 'accountId' && args._count) {
        return Promise.resolve([
          { accountId: 'GABC', _count: { accountId: 7 } },
          { accountId: null, _count: { accountId: 99 } },
        ]);
      }
      return Promise.resolve([{ accountId: 'GABC', _count: 1 }]);
    });

    const res = await statsRequest();
    const body = await res.json();
    expect(body.data.topAccounts).toEqual([{ accountId: 'GABC', count: 7 }]);
  });
});
