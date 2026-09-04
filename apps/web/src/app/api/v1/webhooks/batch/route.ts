import { prisma } from '@mizpah-pulse/database';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { errorResponse, successResponse, ErrorCode } from '@/lib/api-errors';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { rateLimit } from '@/lib/rate-limit';
import { isPublicWebhookEndpoint } from '@/lib/ssrf';
import { sanitizeWebhook } from '@/lib/webhook-utils';
import { CreateWebhookSchema, BatchWebhooksSchema } from '@/lib/webhook-schemas';
import { withRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/webhooks/batch
 *
 * Register up to {@link MAX_WEBHOOK_BATCH_SIZE} webhook subscriptions in a
 * single request. All webhooks are created in one transaction — either every
 * subscription is persisted or none is (issue #45).
 */
async function POSTHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 10,
    windowMs: 60_000,
    keyPrefix: 'webhooks:batch-create',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  try {
    const rawBody = await request.json();
    const parsed = BatchWebhooksSchema.safeParse(rawBody);

    if (!parsed.success) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid webhook batch',
        parsed.error.flatten() as unknown as Record<string, unknown>,
      );
    }

    const rawWebhooks = parsed.data.webhooks;

    // Per-item validation so callers can see exactly which entry failed and
    // why (the outer schema intentionally leaves items untyped).
    const itemErrors: Array<{
      index: number;
      errors: Record<string, unknown>;
    }> = [];
    const webhooks: Array<z.infer<typeof CreateWebhookSchema>> = [];

    for (let i = 0; i < rawWebhooks.length; i++) {
      const item = CreateWebhookSchema.safeParse(rawWebhooks[i]);
      if (!item.success) {
        itemErrors.push({
          index: i,
          errors: item.error.flatten() as unknown as Record<string, unknown>,
        });
      } else {
        webhooks.push(item.data);
      }
    }

    if (itemErrors.length > 0) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'One or more webhooks failed validation', {
        items: itemErrors,
      });
    }

    // Environment-level guards shared with the single-create endpoint.
    for (let i = 0; i < webhooks.length; i++) {
      const item = webhooks[i];
      if (process.env.NODE_ENV === 'production' && !item.endpoint.startsWith('https://')) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Webhooks must use HTTPS in production (index ${i})`,
        );
      }
      if (process.env.NODE_ENV !== 'test') {
        const endpointCheck = await isPublicWebhookEndpoint(item.endpoint);
        if (!endpointCheck.ok) {
          return errorResponse(
            ErrorCode.VALIDATION_ERROR,
            `Webhook endpoint rejected (index ${i}): ${endpointCheck.reason ?? 'address check failed'}`,
          );
        }
      }
    }

    // Atomic: create every subscription in a single transaction.
    const created = await prisma.$transaction(
      webhooks.map((item) =>
        prisma.webhookSubscription.create({
          data: {
            userId: item.userId || 'default',
            endpoint: item.endpoint,
            events: JSON.stringify(item.events),
            secret: item.secret || `whsec_${uuidv4()}`,
          },
        }),
      ),
    );

    return successResponse(
      {
        created: created.length,
        webhooks: created.map((w: { events: unknown; [key: string]: unknown }) =>
          sanitizeWebhook({ ...w, events: JSON.parse(w.events as string) }),
        ),
      },
      201,
      undefined,
      rateLimitResult.headers,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Invalid webhook batch',
        error.flatten() as unknown as Record<string, unknown>,
      );
    }
    if (error instanceof SyntaxError) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'Request body must be valid JSON');
    }
    return prismaErrorResponse(error, 'Failed to create webhooks');
  }
}

export const POST = withRequestId(POSTHandler);
