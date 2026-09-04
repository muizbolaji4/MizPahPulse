import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { z } from 'zod';
import { errorResponse, successResponse, ErrorCode } from '@/lib/api-errors';
import { parsePagination, buildPaginationArgs, paginatedResponse } from '@/lib/pagination';
import { rateLimit } from '@/lib/rate-limit';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Query validation for the event-type filter (issue #32): values must be
 * non-empty strings and the list is capped to keep Prisma `IN` clauses sane.
 */
const ContractEventsQuerySchema = z.object({
  eventTypes: z.array(z.string().min(1).max(64)).max(20).optional(),
});

/**
 * GET /api/v1/contracts/[id]/events
 *
 * Fetch events for a specific contract with pagination and filtering.
 */
async function GETHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    keyPrefix: 'contract-events',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  try {
    const { id } = await props.params;
    if (!id || id.length < 10) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid contract ID');
    }

    const { searchParams } = new URL(request.url);

    const queryResult = ContractEventsQuerySchema.safeParse({
      eventTypes: searchParams.getAll('eventType'),
    });
    if (!queryResult.success) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid event type filter',
        queryResult.error.flatten() as unknown as Record<string, unknown>,
      );
    }
    const eventTypes = queryResult.data.eventTypes ?? [];

    const pagination = parsePagination(searchParams);

    const where: Record<string, unknown> = { contractId: id };
    if (eventTypes.length > 0) {
      where.eventType = { in: eventTypes };
    }

    const args = buildPaginationArgs(where, pagination);
    const [events, total] = await Promise.all([
      prisma.event.findMany(args),
      prisma.event.count({ where }),
    ]);

    const result = paginatedResponse(
      events as Array<{ id: string } & (typeof events)[0]>,
      total,
      pagination,
    );

    return successResponse(
      {
        contractId: id,
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
    console.error('[API] Contract events error:', error);
    return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to fetch contract events');
  }
}

export const GET = withCompression(withRequestId(GETHandler));
