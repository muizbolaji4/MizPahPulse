import { NextResponse } from 'next/server';
import { gzipSync } from 'zlib';

/**
 * Response compression for API list endpoints (issue #40).
 *
 * Next.js route handlers do not compress responses by default, so large JSON
 * payloads (event lists, search results, …) go out uncompressed. This wrapper
 * gzips any JSON response whose body exceeds {@link COMPRESS_MIN_BYTES} when
 * the client advertises `Accept-Encoding: gzip`, and is applied to the read /
 * list endpoints alongside `withRequestId`.
 *
 * Small responses are returned untouched (a fast path based on the
 * `Content-Length` header) so we never pay to buffer a body that would not be
 * worth compressing.
 */

/** Responses smaller than this are returned uncompressed. */
export const COMPRESS_MIN_BYTES = 1024;

function isRequest(value: unknown): value is Request {
  return value instanceof Request;
}

/**
 * Wrap a route handler so its JSON response is gzip-compressed when it is
 * large enough and the client accepts gzip. Works for both success and error
 * responses since it post-processes whatever the handler returns.
 */
export function withCompression<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse> | NextResponse,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args): Promise<NextResponse> => {
    const response = await handler(...args);
    const request = args[0];

    if (!isRequest(request)) return response;

    const acceptEncoding = request.headers.get('accept-encoding') ?? '';
    if (!acceptEncoding.includes('gzip')) return response;

    // Fast path: the body is already known to be small — leave it untouched.
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 0 && contentLength < COMPRESS_MIN_BYTES) {
      return response;
    }

    // Buffer the body so we can measure it and, when worthwhile, re-encode it.
    const text = await response.text();

    // Preserve the original headers/status while switching to a gzip body.
    const headers = new Headers(response.headers);
    headers.set('Vary', 'Accept-Encoding');
    headers.delete('Content-Length');

    if (text.length === 0) {
      // Empty body (e.g. 204) — nothing to compress.
      return new NextResponse(null, { status: response.status, headers });
    }

    const body = Buffer.from(text, 'utf-8');
    if (body.byteLength < COMPRESS_MIN_BYTES) {
      // Re-serialize so the caller still receives a usable (unconsumed)
      // response. All API routes return JSON, so a parse/stringify round trip
      // is lossless here.
      return NextResponse.json(JSON.parse(text), {
        status: response.status,
        headers,
      });
    }

    headers.set('Content-Encoding', 'gzip');
    return new NextResponse(gzipSync(body), { status: response.status, headers });
  };
}
