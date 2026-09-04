/**
 * Tests for POST /api/v1/webhooks/batch (issue #45).
 *
 * Covers atomic creation inside a transaction, per-item validation errors,
 * batch size limits, and rate limiting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  webhookSubscription: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@mizpah-pulse/database', () => ({
  prisma: prismaMock,
  default: prismaMock,
}));

const rateLimitMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { POST } from '@/app/api/v1/webhooks/batch/route';

const validWebhook = (overrides: Record<string, unknown> = {}) => ({
  endpoint: 'https://example.com/hook',
  events: ['PAYMENT'],
  secret: 'whsec_super_secret_value_123',
  ...overrides,
});

const createdWebhook = (id: string, input: Record<string, unknown>) => ({
  id,
  userId: 'default',
  endpoint: input.endpoint,
  // The route stringifies `events` before persisting; mirror that.
  events: input.events as string,
  secret: 'whsec_super_secret_value_123',
  isActive: true,
  maxRetries: 3,
  retryDelayMs: 5000,
  failedDeliveries: 0,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
});

function postBatch(payload: unknown) {
  return POST(
    new Request('http://localhost:3000/api/v1/webhooks/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    undefined,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockResolvedValue({ limited: false, headers: {}, response: null });
  prismaMock.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
    Promise.all(ops),
  );
  prismaMock.webhookSubscription.create.mockImplementation(
    (args: { data: Record<string, unknown> }) =>
      Promise.resolve(createdWebhook(`wh_${args.data.endpoint}`, args.data)),
  );
});

describe('POST /api/v1/webhooks/batch', () => {
  it('creates every webhook atomically in a single transaction', async () => {
    const res = await postBatch({
      webhooks: [validWebhook({ endpoint: 'https://a.example.com/hook' }), validWebhook()],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(2);
    expect(body.data.webhooks).toHaveLength(2);
    // Secrets never leak; each response carries the masked placeholder.
    for (const webhook of body.data.webhooks) {
      expect(webhook.secret).toBeUndefined();
      expect(webhook.secretMasked).toBe('whsec_••••••••••••');
      expect(webhook.events).toEqual(['PAYMENT']);
    }
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.webhookSubscription.create).toHaveBeenCalledTimes(2);
  });

  it('generates a signing secret for entries that omit one', async () => {
    await postBatch({ webhooks: [validWebhook({ secret: undefined })] });
    expect(prismaMock.webhookSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secret: expect.stringMatching(/^whsec_/),
        }),
      }),
    );
  });

  it('rejects an empty batch', async () => {
    const res = await postBatch({ webhooks: [] });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than the allowed maximum', async () => {
    const oversized = Array.from({ length: 51 }, (_, i) =>
      validWebhook({ endpoint: `https://hook-${i}.example.com` }),
    );
    const res = await postBatch({ webhooks: oversized });
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('reports per-item validation errors with their indexes', async () => {
    const res = await postBatch({
      webhooks: [validWebhook(), { endpoint: 'not-a-url', events: [] }],
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.details.items).toHaveLength(1);
    expect(body.error.details.items[0].index).toBe(1);
    expect(body.error.details.items[0].errors).toBeDefined();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    rateLimitMock.mockResolvedValue({
      limited: true,
      headers: {},
      response: new Response('Too Many Requests', { status: 429 }),
    });

    const res = await postBatch({ webhooks: [validWebhook()] });
    expect(res.status).toBe(429);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/v1/webhooks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
      undefined,
    );
    expect(res.status).toBe(400);
  });
});
