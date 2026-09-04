import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { z } from 'zod';
import { errorResponse, successResponse, ErrorCode } from '@/lib/api-errors';
import { buildPaginationArgs, paginatedResponse, type PaginationParams } from '@/lib/pagination';
import { rateLimit } from '@/lib/rate-limit';
import { isValidPublicKey } from '@mizpah-pulse/stellar';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Query validation for the cursor-paginated activity feed (issue #32): invalid
 * or out-of-range `limit`/`cursor`/`sort` values fail with a 400 instead of
 * being silently coerced, matching the other v1 endpoints.
 */
const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(128).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/v1/accounts/[id]/activity
 *
 * Fetch activity summary and recent events for a Stellar account.
 */
async function GETHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 30,
    windowMs: 60_000,
    keyPrefix: 'account-activity',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  try {
    const { id } = await props.params;
    if (!isValidPublicKey(id)) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key');
    }

    const { searchParams } = new URL(request.url);

    const queryResult = ActivityQuerySchema.safeParse({
      limit: searchParams.get('limit') || undefined,
      cursor: searchParams.get('cursor') || undefined,
      sort: searchParams.get('sort') || undefined,
    });
    if (!queryResult.success) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid pagination parameters',
        queryResult.error.flatten() as unknown as Record<string, unknown>,
      );
    }

    const pagination: PaginationParams = {
      limit: queryResult.data.limit,
      cursor: queryResult.data.cursor,
      sortOrder: queryResult.data.sort,
    };

    const where = { accountId: id };
    const args = buildPaginationArgs(where, pagination);

    const [events, total, paymentCount, contractCount] = await Promise.all([
      prisma.event.findMany(args),
      prisma.event.count({ where }),
      prisma.event.count({ where: { ...where, category: 'PAYMENT' } }),
      prisma.event.count({ where: { ...where, category: 'CONTRACT' } }),
    ]);

    const result = paginatedResponse(
      events as Array<{ id: string } & (typeof events)[0]>,
      total,
      pagination,
    );

    return successResponse(
      {
        accountId: id,
        summary: {
          totalTransactions: total,
          payments: paymentCount,
          contractInteractions: contractCount,
        },
        total: result.total,
        limit: result.limit,
        cursor: result.cursor,
        hasMore: result.hasMore,
        // NOTE: never spread `result.data` (raw Prisma rows) here — BigInt
        // `ledgerSequence` values are not JSON-serializable. Normalize first.
        events: result.data.map((e) => ({
          ...e,
          ledgerSequence: (e as unknown as { ledgerSequence: bigint }).ledgerSequence.toString(),
          payload:
            typeof (e as unknown as { payload: unknown }).payload === 'string'
              ? JSON.parse((e as unknown as { payload: string }).payload)
              : (e as unknown as { payload: unknown }).payload,
        })),
      },
      undefined,
      undefined,
      rateLimitResult.headers,
    );
  } catch (error) {
    console.error('[API] Account activity error:', error);
    return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to fetch account activity');
  }
}

export const GET = withCompression(withRequestId(GETHandler));
