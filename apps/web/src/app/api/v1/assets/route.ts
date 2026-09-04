import { prisma } from '@mizpah-pulse/database';
import { z } from 'zod';
import { errorResponse, successResponse, ErrorCode } from '@/lib/api-errors';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireApiKey } from '@/lib/api-key';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ASSET_LIMIT = 50;

const AssetSearchQuerySchema = z.object({
  // A code or issuer search must be at least one trimmed character and is
  // capped to keep the LIKE pattern sane (issue #41).
  q: z.string().trim().min(1, 'Search query is required').max(64, 'Query is too long'),
  limit: z.coerce.number().int().min(1).max(MAX_ASSET_LIMIT).default(20),
});

/**
 * GET /api/v1/assets?q=&limit=
 *
 * Search the asset cache by code or issuer (case-insensitive substring).
 */
async function GETHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 60,
    windowMs: 60_000,
    keyPrefix: 'assets:search',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  // Validate API keys when presented (and require them when configured).
  const auth = await requireApiKey(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const queryResult = AssetSearchQuerySchema.safeParse({
    q: searchParams.get('q'),
    // Absent params arrive as `null`; treat them as unset so the schema's
    // defaults apply instead of coercing `null` into 0.
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!queryResult.success) {
    return errorResponse(
      ErrorCode.VALIDATION_ERROR,
      'Invalid query parameters',
      queryResult.error.flatten() as unknown as Record<string, unknown>,
    );
  }

  const { q, limit } = queryResult.data;

  try {
    const assets = await prisma.asset.findMany({
      where: {
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { issuer: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { code: 'asc' },
      take: limit,
      select: { id: true, code: true, issuer: true, type: true },
    });

    return successResponse({ query: q, assets }, undefined, undefined, rateLimitResult.headers);
  } catch (error) {
    return prismaErrorResponse(error, 'Failed to search assets', 'n/a');
  }
}

export const GET = withCompression(withRequestId(GETHandler));
