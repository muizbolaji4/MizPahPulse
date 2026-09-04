/**
 * Tests for the response compression helper (issue #40).
 *
 * Exercises `withCompression` around a stub handler returning API-style JSON
 * responses: only bodies over the threshold get gzip-encoded, only when the
 * client advertises `Accept-Encoding: gzip`, and both success and error
 * responses round-trip losslessly.
 */
import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'zlib';
import { NextResponse } from 'next/server';
import { successResponse, errorResponse, ErrorCode } from '@/lib/api-errors';
import { withCompression, COMPRESS_MIN_BYTES } from '@/lib/compress';

/** Stub "list" handler returning a JSON payload of roughly the given size. */
function jsonHandler(size: number, status = 200, error = false) {
  const bigString = 'x'.repeat(size);
  return async (_request: Request) => {
    void status;
    if (error) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, `big error ${bigString}`);
    }
    return successResponse({ list: [bigString], id: 'item-1' });
  };
}

function gzipRequest(): Request {
  return new Request('http://localhost/api/v1/events', {
    headers: { 'accept-encoding': 'gzip' },
  });
}

function plainRequest(): Request {
  return new Request('http://localhost/api/v1/events');
}

async function decodedBody(res: Response): Promise<Record<string, unknown>> {
  const buffer = Buffer.from(await res.arrayBuffer());
  const text =
    res.headers.get('content-encoding') === 'gzip'
      ? gunzipSync(buffer).toString('utf-8')
      : buffer.toString('utf-8');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('withCompression', () => {
  it('gzip-compresses responses larger than the threshold', async () => {
    const handler = withCompression(jsonHandler(COMPRESS_MIN_BYTES + 4096));
    const res = await handler(gzipRequest());

    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('vary')?.toLowerCase()).toContain('accept-encoding');
    expect(res.status).toBe(200);

    const decoded = await decodedBody(res);
    expect((decoded.data as { list: string[] }).list[0].length).toBe(COMPRESS_MIN_BYTES + 4096);
  });

  it('leaves small responses untouched', async () => {
    const handler = withCompression(jsonHandler(64));
    const res = await handler(gzipRequest());

    expect(res.headers.get('content-encoding')).toBeNull();
    const decoded = await decodedBody(res);
    expect((decoded.data as { list: string[] }).list[0].length).toBe(64);
    expect(decoded.success).toBe(true);
  });

  it('does not compress when the client does not accept gzip', async () => {
    const handler = withCompression(jsonHandler(COMPRESS_MIN_BYTES + 4096));
    const res = await handler(plainRequest());

    expect(res.headers.get('content-encoding')).toBeNull();
    const decoded = await decodedBody(res);
    expect((decoded.data as { list: string[] }).list[0].length).toBe(COMPRESS_MIN_BYTES + 4096);
  });

  it('compresses error responses too', async () => {
    const handler = withCompression(jsonHandler(COMPRESS_MIN_BYTES + 4096, 500, true));
    const res = await handler(gzipRequest());

    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.status).toBe(500);
    const decoded = await decodedBody(res);
    expect(decoded.success).toBe(false);
    expect((decoded.error as { message: string }).message).toContain('big error');
  });

  it('preserves extra headers through the compression path', async () => {
    const handler = withCompression(async (_request: Request) =>
      NextResponse.json(
        { success: true, data: { list: ['y'.repeat(COMPRESS_MIN_BYTES + 2048)] } },
        { headers: { 'X-Custom': 'kept' } },
      ),
    );
    const res = await handler(gzipRequest());
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('x-custom')).toBe('kept');
  });
});
