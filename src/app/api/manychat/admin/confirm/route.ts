import { connectChannel } from "../../../../../lib/activation";
import { prisma } from "../../../../../lib/prisma";

// Founder-only: confirms a specific operator's ManyChat connection is actually
// live, after manually verifying it in the ManyChat dashboard (there is no
// ManyChat API to check "is this page linked and the flow active" — that
// manual verification IS the founder's few-minutes-per-operator step, same as
// cloning the flow itself). This is the ONLY thing (besides a future ManyChat
// status webhook) that flips a ChannelConnection to "connected".
//
// Protected by a shared secret (X-Admin-Secret) since there's no admin UI/auth
// yet. Reuses connectChannel() so the exact same recompute-and-maybe-fire-
// WentLive path Stripe/calendar already use runs here too — no new gate logic.

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MANYCHAT_ADMIN_SECRET;
  if (!secret) {
    return Response.json({ error: "admin confirm not configured" }, { status: 503 });
  }
  if (request.headers.get("x-admin-secret") !== secret) {
    return Response.json({ error: "invalid secret" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { channelConnectionId, manychatSubscriberId } = (body ?? {}) as {
    channelConnectionId?: string;
    manychatSubscriberId?: string;
  };
  if (!channelConnectionId) {
    return Response.json({ error: "channelConnectionId required" }, { status: 400 });
  }

  const conn = await prisma.channelConnection.findUnique({ where: { id: channelConnectionId } });
  if (!conn) return Response.json({ error: "not found" }, { status: 404 });

  if (manychatSubscriberId) {
    await prisma.channelConnection.update({
      where: { id: conn.id },
      data: { manychatSubscriberId },
    });
  }

  // A confirming provider: connect() just reports "connected" (the real work —
  // manual verification — already happened outside this request). Reuses the
  // existing orchestrator so persistence + readiness recompute stay identical
  // to every other connect path.
  const confirmingProvider = {
    mode: "manychat" as const,
    async connect() {
      return { status: "connected" as const, pageId: conn.pageId ?? undefined };
    },
    async sendMessage() {
      throw new Error("not used by the confirm route");
    },
    async status() {
      return { status: "connected" as const };
    },
  };

  const result = await connectChannel(prisma, confirmingProvider, conn.id);
  return Response.json({ ok: true, status: result.status, recompute: result.recompute });
}
