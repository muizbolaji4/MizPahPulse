/**
 * Tests for GET /api/v1/status (issue #44).
 *
 * Covers the dependency report (database / last event / WS probe), degraded
 * dependency reporting without a 5xx, rate limiting, and API-key auth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  event: { findFirst: vi.fn() },
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

import { GET } from '@/app/api/v1/status/route';

function statusRequest() {
  return GET(new Request('http://localhost:3000/api/v1/status'), undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  prismaMock.event.findFirst.mockResolvedValue({
    timestamp: new Date('2026-09-01T12:00:00.000Z'),
  });
  rateLimitMock.mockResolvedValue({ limited: false, headers: {}, response: null });
  requireApiKeyMock.mockResolvedValue({ response: null });
  // Simulate a configured, reachable WS service unless a test overrides this.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
  );
  vi.stubEnv('NEXT_PUBLIC_WS_URL', 'http://localhost:3001');
});

describe('GET /api/v1/status', () => {
  it('reports version, database health, and the last indexed event', async () => {
    const res = await statusRequest();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.version).toBeTypeOf('string');
    expect(body.data.database).toBe('ok');
    expect(body.data.lastEventAt).toBe('2026-09-01T12:00:00.000Z');
    expect(body.data.ws).toEqual({ status: 'ok', url: 'http://localhost:3001/health' });
    expect(body.data.uptime).toBeTypeOf('number');
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it('keeps a 200 with database:error when the database is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await statusRequest();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.database).toBe('error');
  });

  it('reports a null lastEventAt before the first event is indexed', async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);

    const res = await statusRequest();
    const body = await res.json();
    expect(body.data.lastEventAt).toBeNull();
  });

  it('reports the WS service as unreachable when the probe fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const res = await statusRequest();
    const body = await res.json();
    expect(body.data.ws.status).toBe('error');
    expect(body.data.ws.url).toBe('http://localhost:3001/health');
  });

  it('reports the WS service as unavailable when no URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '');

    const res = await statusRequest();
    const body = await res.json();
    expect(body.data.ws).toEqual({ status: 'unavailable' });
  });

  it('returns 429 when rate limited', async () => {
    rateLimitMock.mockResolvedValue({
      limited: true,
      headers: {},
      response: new Response('Too Many Requests', { status: 429 }),
    });

    const res = await statusRequest();
    expect(res.status).toBe(429);
  });

  it('honors API-key enforcement responses', async () => {
    requireApiKeyMock.mockResolvedValue({
      response: new Response('Unauthorized', { status: 401 }),
    });

    const res = await statusRequest();
    expect(res.status).toBe(401);
  });
});
