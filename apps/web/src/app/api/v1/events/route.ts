import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { EventType, EventCategory, EventSeverity } from '@mizpah-pulse/types';
import { errorResponse, successResponse, ErrorCode, createRequestId } from '@/lib/api-errors';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { recordRequest } from '@/lib/monitoring';
import { requireApiKey } from '@/lib/api-key';
import { z } from 'zod';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * URL query schema. Numbers are coerced from strings so invalid input like
 * `limit=abc` or `minLedger=-5` fails cleanly with a 400 instead of leaking
 * NaN into a Prisma query (which previously surfaced as a 500).
 */
const EventQuerySchema = z.object({
  eventTypes: z.array(EventType).optional(),
  categories: z.array(EventCategory).optional(),
  accountIds: z.array(z.string()).optional(),
  contractIds: z.array(z.string()).optional(),
  assetCodes: z.array(z.string()).optional(),
  severity: z.array(EventSeverity).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minLedger: z.coerce.number().int().positive().optional(),
  maxLedger: z.coerce.number().int().positive().optional(),
  searchQuery: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

type EventQuery = z.infer<typeof EventQuerySchema>;

/**
 * GET /api/v1/events
 *
 * Query processed blockchain events with filtering, pagination, and sorting.
 */
async function GETHandler(request: Request) {
  // Apply rate limiting: 60 requests per minute per IP
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    keyPrefix: 'events',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  // Validate API keys when presented (and require them when configured).
  const auth = await requireApiKey(request);
  if (auth.response) return auth.response;

  const requestId = request.headers.get('X-Request-ID') ?? createRequestId();

  try {
    const { searchParams } = new URL(request.url);

    const rawFilters = {
      eventTypes: searchParams.getAll('eventType') || undefined,
      categories: searchParams.getAll('category') || undefined,
      accountIds: searchParams.getAll('accountId') || undefined,
      contractIds: searchParams.getAll('contractId') || undefined,
      assetCodes: searchParams.getAll('assetCode') || undefined,
      severity: searchParams.getAll('severity') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      minLedger: searchParams.get('minLedger') || undefined,
      maxLedger: searchParams.get('maxLedger') || undefined,
      searchQuery: searchParams.get('q') || undefined,
      limit: searchParams.get('limit') || undefined,
      cursor: searchParams.get('cursor') || undefined,
      sortOrder: searchParams.get('sort') || undefined,
    };

    const filters: EventQuery = EventQuerySchema.parse(rawFilters);

    const where: Record<string, unknown> = {};

    if (filters.eventTypes?.length) where.eventType = { in: filters.eventTypes };
    if (filters.categories?.length) where.category = { in: filters.categories };
    if (filters.accountIds?.length) where.accountId = { in: filters.accountIds };
    if (filters.contractIds?.length) where.contractId = { in: filters.contractIds };
    if (filters.assetCodes?.length) where.assetCode = { in: filters.assetCodes };
    if (filters.severity?.length) where.severity = { in: filters.severity };
    if (filters.startDate)
      where.timestamp = { ...(where.timestamp as object), gte: new Date(filters.startDate) };
    if (filters.endDate)
      where.timestamp = { ...(where.timestamp as object), lte: new Date(filters.endDate) };
    if (filters.minLedger)
      where.ledgerSequence = { ...(where.ledgerSequence as object), gte: filters.minLedger };
    if (filters.maxLedger)
      where.ledgerSequence = { ...(where.ledgerSequence as object), lte: filters.maxLedger };
    if (filters.searchQuery) {
      where.OR = [
        { transactionHash: { contains: filters.searchQuery, mode: 'insensitive' } },
        { accountId: { contains: filters.searchQuery, mode: 'insensitive' } },
        { contractId: { contains: filters.searchQuery, mode: 'insensitive' } },
        { eventType: { contains: filters.searchQuery, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { timestamp: filters.sortOrder },
        take: filters.limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
      prisma.event.count({ where }),
    ]);

    const hasMore = events.length > filters.limit;
    const data = hasMore ? events.slice(0, filters.limit) : events;

    return successResponse(
      {
        events: data.map(
          (e: {
            id: string;
            payload: unknown;
            ledgerSequence: number | bigint;
            [key: string]: unknown;
          }) => ({
            ...e,
            ledgerSequence: e.ledgerSequence.toString(),
            payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
          }),
        ),
        total,
        limit: filters.limit,
        cursor: hasMore ? data[data.length - 1]?.id : undefined,
        hasMore,
      },
      undefined,
      undefined,
      { 'X-Request-ID': requestId, ...rateLimitResult.headers },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordRequest(0, true);
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid filter parameters',
        error.flatten() as unknown as Record<string, unknown>,
        requestId,
      );
    }
    logger.error(`[API] Events error (requestId=${requestId}):`, error);
    recordRequest(0, true);
    return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to fetch events', undefined, requestId);
  }
}

export const GET = withCompression(withRequestId(GETHandler));
