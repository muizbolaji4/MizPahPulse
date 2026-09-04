/**
 * Tests for GET /api/v1/assets (issue #41).
 *
 * Covers the case-insensitive code/issuer search, query-length validation,
 * limit capping, rate limiting, and API-key auth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  asset: {
    findMany: vi.fn(),
  },
}));

vi.mock('@mizpah-pulse/database', () => ({
  prisma: prismaMock,
  default: prismaMock,
}));

const rateLimitMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

const requireApiKeyMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-key', () => ({
  requireApiKey: requireApiKeyMock,
}));

import { GET } from '@/app/api/v1/assets/route';

const asset = (overrides: Record<string, unknown> = {}) => ({
  id: 'asset_1',
  code: 'USDC',
  issuer: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  type: 'credit_alphanum4',
  ...overrides,
});

function searchAssets(query = '') {
  return GET(new Request(`http://localhost:3000/api/v1/assets${query}`), undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.asset.findMany.mockResolvedValue([]);
  rateLimitMock.mockResolvedValue({ limited: false, headers: {}, response: null });
  requireApiKeyMock.mockResolvedValue({ response: null });
});

describe('GET /api/v1/assets', () => {
  it('searches by code or issuer case-insensitively', async () => {
    prismaMock.asset.findMany.mockResolvedValue([asset()]);
    const res = await searchAssets('?q=usdc');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query).toBe('usdc');
    expect(body.data.assets).toHaveLength(1);
    expect(body.data.assets[0]).toMatchObject({ code: 'USDC', type: 'credit_alphanum4' });
    expect(prismaMock.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { code: { contains: 'usdc', mode: 'insensitive' } },
            { issuer: { contains: 'usdc', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('rejects a missing search query', async () => {
    const res = await searchAssets('');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });

  it('rejects an over-long search query', async () => {
    const res = await searchAssets(`?q=${'a'.repeat(65)}`);
    expect(res.status).toBe(400);
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });

  it('caps the result limit at the configured maximum', async () => {
    prismaMock.asset.findMany.mockResolvedValue([asset()]);
    const res = await searchAssets('?q=xlm&limit=500');
    expect(res.status).toBe(400);

    // And a valid in-range limit is forwarded to Prisma.
    await searchAssets('?q=xlm&limit=50');
    expect(prismaMock.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('returns 429 when rate limited', async () => {
    rateLimitMock.mockResolvedValue({
      limited: true,
      headers: {},
      response: new Response('Too Many Requests', { status: 429 }),
    });

    const res = await searchAssets('?q=usdc');
    expect(res.status).toBe(429);
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });

  it('honors API-key enforcement responses', async () => {
    requireApiKeyMock.mockResolvedValue({
      response: new Response('Unauthorized', { status: 401 }),
    });

    const res = await searchAssets('?q=usdc');
    expect(res.status).toBe(401);
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });

  it('maps database failures to an error response', async () => {
    prismaMock.asset.findMany.mockRejectedValue(new Error('connection refused'));

    const res = await searchAssets('?q=usdc');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
