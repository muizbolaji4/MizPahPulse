import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { successResponse, errorResponse, ErrorCode } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { recordRequest } from '@/lib/monitoring';
import { requireApiKey } from '@/lib/api-key';
import { withRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple in-memory cache
let cachedStats: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

/**
 * GET /api/v1/stats
 *
 * Aggregated dashboard statistics with caching.
 */
async function GETHandler(request: Request) {
  // Validate API keys when presented (and require them when configured).
  const auth = await requireApiKey(request);
  if (auth.response) return auth.response;

  try {
    const now = Date.now();
    if (cachedStats && now - cachedStats.timestamp < CACHE_TTL) {
      return NextResponse.json(
        { ...(cachedStats.data as object), cached: true },
        { headers: { 'X-Cache': 'HIT' } },
      );
    }

    const [
      totalEvents,
      eventCount24h,
      recentEvents,
      uniqueAccounts,
      contractCount,
      topAccountGroups,
    ] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({
        where: {
          timestamp: { gte: new Date(now - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.event.findMany({
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: {
          id: true,
          eventType: true,
          category: true,
          timestamp: true,
          accountId: true,
        },
      }),
      prisma.event
        .groupBy({
          by: ['accountId'],
          _count: true,
          orderBy: { _count: { accountId: 'desc' } },
          take: 1,
        })
        .then((r) => r[0]?._count ?? 0),
      prisma.event
        .groupBy({
          by: ['contractId'],
          where: { contractId: { not: null } },
          _count: true,
        })
        .then((r) => r.length),
      prisma.event.groupBy({
        by: ['accountId'],
        where: { accountId: { not: null } },
        _count: { accountId: true },
        orderBy: { _count: { accountId: 'desc' } },
        take: 5,
      }),
    ]);

    // Most active accounts by event volume (issue #13).
    const topAccounts = topAccountGroups
      .map((g) => ({
        accountId: g.accountId as string,
        count: g._count.accountId,
      }))
      .filter((a) => a.accountId);

    const stats = {
      totalEvents,
      eventsLast24h: eventCount24h,
      uniqueAccounts: uniqueAccounts,
      trackedContracts: contractCount,
      topAccounts,
      recentActivity: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        category: e.category,
        timestamp: e.timestamp,
        accountId: e.accountId,
      })),
    };

    cachedStats = { data: stats, timestamp: now };

    return successResponse(stats, 200, { cached: false });
  } catch (error) {
    const requestId = request.headers.get('X-Request-ID') ?? 'n/a';
    logger.error(`[API] Stats error (requestId=${requestId}):`, error);
    recordRequest(0, true);
    return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to fetch statistics');
  }
}

export const GET = withRequestId(GETHandler);
