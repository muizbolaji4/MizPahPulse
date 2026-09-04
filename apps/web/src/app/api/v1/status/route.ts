import { prisma } from '@mizpah-pulse/database';
import { APP_VERSION } from '@/lib/constants';
import { successResponse } from '@/lib/api-errors';
import { rateLimit } from '@/lib/rate-limit';
import { requireApiKey } from '@/lib/api-key';
import { withRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upper bound for the WS reachability probe — status must stay fast. */
const WS_PROBE_TIMEOUT_MS = 1200;

interface WsProbeResult {
  status: 'ok' | 'error' | 'unavailable';
  url?: string;
}

/** The WS service exposes a `/health` route on its HTTP listener. */
function wsHealthUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_WS_URL;
  if (!base || !/^https?:\/\//.test(base)) return null;
  return `${base.replace(/\/+$/, '')}/health`;
}

/** Lightweight reachability probe for the realtime (WS) service. */
async function probeWs(): Promise<WsProbeResult> {
  const url = wsHealthUrl();
  if (!url) return { status: 'unavailable' };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(WS_PROBE_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    return { status: res.ok ? 'ok' : 'error', url };
  } catch {
    return { status: 'error', url };
  }
}

/**
 * GET /api/v1/status
 *
 * Lightweight dependency status for API consumers (issue #44). Deliberately
 * avoids expensive queries: the database check is `SELECT 1` and the "last
 * indexed event" lookup uses the timestamp index.
 */
async function GETHandler(request: Request) {
  const rateLimitResult = await rateLimit(request, {
    maxRequests: 120,
    windowMs: 60_000,
    keyPrefix: 'status',
  });
  if (rateLimitResult.limited) return rateLimitResult.response!;

  // Validate API keys when presented (and require them when configured).
  const auth = await requireApiKey(request);
  if (auth.response) return auth.response;

  const start = Date.now();

  const [dbResult, lastEventResult, wsResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.event.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    probeWs(),
  ]);

  const database = dbResult.status === 'fulfilled' ? 'ok' : 'error';
  const lastEventAt =
    lastEventResult.status === 'fulfilled' && lastEventResult.value?.timestamp
      ? new Date(lastEventResult.value.timestamp).toISOString()
      : null;
  const ws: WsProbeResult = wsResult.status === 'fulfilled' ? wsResult.value : { status: 'error' };

  return successResponse(
    {
      version: APP_VERSION,
      database,
      lastEventAt,
      ws,
      uptime: Math.round(process.uptime()),
      latencyMs: Date.now() - start,
    },
    undefined,
    undefined,
    rateLimitResult.headers,
  );
}

export const GET = withRequestId(GETHandler);
