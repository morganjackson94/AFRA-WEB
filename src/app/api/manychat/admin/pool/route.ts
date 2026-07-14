import { backfillOneWaitingOperator, getPoolDepth } from "../../../../../lib/manychatPool";
import { prisma } from "../../../../../lib/prisma";

// Founder-only pool loader. ManyChat's API can't create flows, so this is
// purely a paste-in: the founder hand-clones ~10 generic flows in the
// ManyChat UI, captures each one's hosted connect URL (and namespace, if
// they'll need sendFlow() later), and POSTs it here one at a time. The app
// never attempts to create a flow itself.
//
// Protected by the same shared secret as the connection-confirm route
// (MANYCHAT_ADMIN_SECRET) — there's no admin UI yet.

function checkSecret(request: Request): Response | null {
  const secret = process.env.MANYCHAT_ADMIN_SECRET;
  if (!secret) return Response.json({ error: "admin pool route not configured" }, { status: 503 });
  if (request.headers.get("x-admin-secret") !== secret) {
    return Response.json({ error: "invalid secret" }, { status: 401 });
  }
  return null;
}

/** GET: pool depth, so the founder can see when it's running low. */
export async function GET(request: Request): Promise<Response> {
  const denied = checkSecret(request);
  if (denied) return denied;

  const depth = await getPoolDepth(prisma);
  return Response.json(depth);
}

/** POST: add one hand-captured flow to the pool. Immediately tries to resolve
 *  whoever's been waiting longest (see backfillOneWaitingOperator) so a
 *  freshly-added flow doesn't sit idle if someone's already paid and waiting. */
export async function POST(request: Request): Promise<Response> {
  const denied = checkSecret(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { connectUrl, flowNs } = (body ?? {}) as { connectUrl?: string; flowNs?: string };
  if (!connectUrl) {
    return Response.json({ error: "connectUrl required" }, { status: 400 });
  }

  const flow = await prisma.manychatFlow.create({
    data: { connectUrl, flowNs: flowNs ?? undefined },
  });

  const backfill = await backfillOneWaitingOperator(prisma);
  const depth = await getPoolDepth(prisma);

  return Response.json({ ok: true, flowId: flow.id, backfill, depth });
}
