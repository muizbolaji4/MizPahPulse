import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { isValidPublicKey, isValidContractId, isValidTransactionHash } from '@mizpah-pulse/stellar';
import { errorResponse, successResponse, ErrorCode, createRequestId } from '@/lib/api-errors';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { recordRequest } from '@/lib/monitoring';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/search
 *
 * Universal search across wallets, contracts, transactions, and assets.
 */
async function GETHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 30,
    windowMs: 60_000,
    keyPrefix: 'search',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'Search query must be at least 2 characters');
  }

  // Pagination for the full-text event results (issue #2). Exact-match lookups
  // (tx hash / public key / contract id) are not paginated — they return at
  // most one row each — so the offset applies to the `events` bucket only.
  const SEARCH_PAGE_SIZE = 10;
  const rawOffset = searchParams.get('offset');
  const offset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);
  if (rawOffset !== null && (Number.isNaN(offset) || offset < 0)) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'offset must be a non-negative integer');
  }

  const requestId = request.headers.get('X-Request-ID') ?? createRequestId();

  try {
    const results: Record<string, unknown[]> = {};

    // Search transactions
    if (isValidTransactionHash(q)) {
      const tx = await prisma.event.findFirst({
        where: { transactionHash: q },
      });
      if (tx) {
        results.transactions = [
          { hash: q, found: true, eventType: tx.eventType, timestamp: tx.timestamp },
        ];
      }
    }

    // Search accounts
    if (isValidPublicKey(q)) {
      const accountEvents = await prisma.event.findMany({
        where: { accountId: q },
        orderBy: { timestamp: 'desc' },
        take: 5,
      });
      const txCount = await prisma.event.count({ where: { accountId: q } });
      results.accounts = [
        {
          publicKey: q,
          eventCount: txCount,
          recentEvents: accountEvents.map(
            (e: { id: string; ledgerSequence: number | bigint; [key: string]: unknown }) => ({
              ...e,
              ledgerSequence: e.ledgerSequence.toString(),
            }),
          ),
        },
      ];
    }

    // Search contracts
    if (isValidContractId(q)) {
      const [events, eventCount] = await Promise.all([
        prisma.event.findMany({
          where: { contractId: q },
          orderBy: { timestamp: 'desc' },
          take: 5,
        }),
        prisma.event.count({ where: { contractId: q } }),
      ]);
      results.contracts = [{ contractId: q, eventCount, recentEvents: events.length }];
    }

    // Full-text search on event types and accounts, paginated with an offset
    // (issue #2). Fetch one extra row so `hasMore` needs no count query.
    const textMatches = await prisma.event.findMany({
      where: {
        OR: [
          { eventType: { contains: q, mode: 'insensitive' } },
          { accountId: { contains: q, mode: 'insensitive' } },
          { assetCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      skip: offset,
      take: SEARCH_PAGE_SIZE + 1,
      orderBy: { timestamp: 'desc' },
    });

    const hasMore = textMatches.length > SEARCH_PAGE_SIZE;
    const page = hasMore ? textMatches.slice(0, SEARCH_PAGE_SIZE) : textMatches;

    if (page.length > 0) {
      results.events = page.map(
        (e: { id: string; ledgerSequence: number | bigint; [key: string]: unknown }) => ({
          ...e,
          ledgerSequence: e.ledgerSequence.toString(),
        }),
      );
    }

    return successResponse(
      {
        query: q,
        results,
        totalResults: Object.values(results).reduce((s, arr) => s + arr.length, 0),
        pagination: {
          offset,
          limit: SEARCH_PAGE_SIZE,
          hasMore,
          nextOffset: offset + page.length,
        },
      },
      undefined,
      undefined,
      { 'X-Request-ID': requestId, ...rateLimitResult.headers },
    );
  } catch (error) {
    logger.error(`[API] Search error (requestId=${requestId}):`, error);
    recordRequest(0, true);
    return errorResponse(ErrorCode.INTERNAL_ERROR, 'Search failed', undefined, requestId);
  }
}

export const GET = withCompression(withRequestId(GETHandler));
