import { z } from 'zod';
import { EventType } from '@mizpah-pulse/types';

/**
 * Shared validation for webhook registration (issues #27, #45).
 *
 * `CreateWebhookSchema` describes a single webhook subscription and is used by
 * both POST /api/v1/webhooks and POST /api/v1/webhooks/batch so the two
 * endpoints accept identical item shapes.
 */

/** Upper bound for a single batch-registration request. */
export const MAX_WEBHOOK_BATCH_SIZE = 50;

export const CreateWebhookSchema = z.object({
  endpoint: z.string().url('Must be a valid HTTPS URL'),
  events: z.array(EventType).min(1, 'At least one event type is required'),
  secret: z.string().min(16, 'Secret must be at least 16 characters').optional(),
  userId: z.string().optional().default('default'),
});

/**
 * Top-level batch shape. Items are intentionally left untyped here: the batch
 * route validates each entry individually so per-index errors can be reported
 * clearly instead of being collapsed into a single flatten().
 */
export const BatchWebhooksSchema = z.object({
  webhooks: z
    .array(z.unknown())
    .min(1, 'At least one webhook is required')
    .max(MAX_WEBHOOK_BATCH_SIZE, `Batch is limited to ${MAX_WEBHOOK_BATCH_SIZE} webhooks`),
});
