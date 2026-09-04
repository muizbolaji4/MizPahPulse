import { NextResponse } from 'next/server';
import { prisma } from '@mizpah-pulse/database';
import { EventType } from '@mizpah-pulse/types';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { errorResponse, successResponse, ErrorCode, createRequestId } from '@/lib/api-errors';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { rateLimit } from '@/lib/rate-limit';
import { isPublicWebhookEndpoint } from '@/lib/ssrf';
import { maskSecret, sanitizeWebhook } from '@/lib/webhook-utils';
import { CreateWebhookSchema } from '@/lib/webhook-schemas';
import { withRequestId } from '@/lib/request-id';
import { withCompression } from '@/lib/compress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListWebhooksQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  userId: z.string().optional().default('default'),
});

/**
 * GET /api/v1/webhooks
 *
 * List all registered webhooks with pagination.
 */
async function GETHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 30,
    windowMs: 60_000,
    keyPrefix: 'webhooks:list',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  const requestId = request.headers.get('X-Request-ID') ?? createRequestId();
  const { searchParams } = new URL(request.url);

  const queryResult = ListWebhooksQuerySchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    userId: searchParams.get('userId'),
  });

  if (!queryResult.success) {
    return errorResponse(
      ErrorCode.VALIDATION_ERROR,
      'Invalid query parameters',
      queryResult.error.flatten() as unknown as Record<string, unknown>,
    );
  }

  const { page, limit, userId } = queryResult.data;
  const skip = (page - 1) * limit;

  try {
    const [webhooks, total] = await Promise.all([
      prisma.webhookSubscription.findMany({
        where: { userId },
        include: { deliveries: { take: 5, orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' }, // newest first
        skip,
        take: limit,
      }),
      prisma.webhookSubscription.count({ where: { userId } }),
    ]);

    return successResponse(
      {
        data: webhooks.map(
          (w: { events: unknown; secret?: string | null; [key: string]: unknown }) =>
            sanitizeWebhook({ ...w, events: JSON.parse(w.events as string) }),
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      undefined,
      undefined,
      { 'X-Request-ID': requestId, ...rateLimitResult.headers },
    );
  } catch (error) {
    return prismaErrorResponse(error, 'Failed to retrieve webhooks', requestId);
  }
}

/**
 * POST /api/v1/webhooks
 *
 * Register a new webhook endpoint.
 */
async function POSTHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 10,
    windowMs: 60_000,
    keyPrefix: 'webhooks:create',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  try {
    const body = await request.json();
    const parsed = CreateWebhookSchema.parse(body);

    if (process.env.NODE_ENV === 'production' && !parsed.endpoint.startsWith('https://')) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Webhook endpoints must use HTTPS in production',
      );
    }

    if (process.env.NODE_ENV !== 'test') {
      const endpointCheck = await isPublicWebhookEndpoint(parsed.endpoint);
      if (!endpointCheck.ok) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Webhook endpoint rejected: ${endpointCheck.reason ?? 'address check failed'}`,
        );
      }
    }

    const webhook = await prisma.webhookSubscription.create({
      data: {
        userId: parsed.userId || 'default',
        endpoint: parsed.endpoint,
        events: JSON.stringify(parsed.events),
        secret: parsed.secret || `whsec_${uuidv4()}`,
      },
    });

    return successResponse(
      sanitizeWebhook({
        ...webhook,
        events: JSON.parse(webhook.events as string),
      }),
      201,
      undefined,
      rateLimitResult.headers,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid webhook configuration',
        error.flatten() as unknown as Record<string, unknown>,
      );
    }
    return prismaErrorResponse(error, 'Failed to create webhook');
  }
}

export const GET = withCompression(withRequestId(GETHandler));
export const POST = withRequestId(POSTHandler);
