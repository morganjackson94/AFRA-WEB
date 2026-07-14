import type { PrismaClient } from "../generated/prisma/client";
import { createLoginToken } from "./auth";
import { sendReadyToConnectEmail } from "./mail";
import { appBaseUrl } from "./session";

// The flow pool — instant-connection primary path. ManyChat's API can't create
// flows, so the founder hand-clones a batch upfront (see the admin pool
// route); this file's only job is claiming one atomically at payment time and
// reporting pool depth so the founder knows when to add more.

export type ClaimResult =
  | { assigned: true; connectUrl: string; flowId: string }
  | { assigned: false };

/**
 * Atomically claim one available flow for an operator. Each attempt is a
 * single conditional UPDATE (`WHERE id = ? AND status = 'available'`), which
 * SQL guarantees is atomic on its own — no explicit transaction needed. Two
 * concurrent claims racing for the SAME row: exactly one UPDATE affects a row
 * (count = 1), the other affects zero (count = 0) and moves on to the next
 * candidate. Looping across a handful of candidates absorbs lost races
 * without ever double-assigning a flow.
 */
export async function claimAvailableFlow(prisma: PrismaClient, operatorId: string): Promise<ClaimResult> {
  const candidates = await prisma.manychatFlow.findMany({
    where: { status: "available" },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, connectUrl: true },
  });

  for (const candidate of candidates) {
    const claim = await prisma.manychatFlow.updateMany({
      where: { id: candidate.id, status: "available" }, // guard: still available?
      data: { status: "assigned", assignedOperatorId: operatorId, assignedAt: new Date() },
    });
    if (claim.count === 1) {
      return { assigned: true, connectUrl: candidate.connectUrl, flowId: candidate.id };
    }
    // count === 0 means we lost the race for this one — try the next candidate.
  }

  return { assigned: false };
}

export type PoolDepth = { available: number; assigned: number };

export async function getPoolDepth(prisma: PrismaClient): Promise<PoolDepth> {
  const [available, assigned] = await Promise.all([
    prisma.manychatFlow.count({ where: { status: "available" } }),
    prisma.manychatFlow.count({ where: { status: "assigned" } }),
  ]);
  return { available, assigned };
}

/**
 * Find the oldest founding operator who paid but is still waiting on a flow
 * (no manychatConnectUrl yet). Used right after the founder adds a new pool
 * entry, so a freshly-added flow immediately resolves whoever's been waiting
 * longest instead of sitting idle until their next unrelated action.
 */
export async function findOldestWaitingOperator(prisma: PrismaClient) {
  return prisma.operator.findFirst({
    where: {
      plan: "founding_annual",
      billingStatus: "active",
      channelConnections: { none: { manychatConnectUrl: { not: null } } },
    },
    orderBy: { createdAt: "asc" },
    include: { channelConnections: true },
  });
}

export type BackfillResult =
  | { backfilled: false; reason: "no-one-waiting" | "pool-empty" }
  | { backfilled: true; operatorId: string };

/**
 * Called right after the founder adds a new pool entry: resolves whoever's
 * been waiting longest instead of leaving a freshly-added flow idle until
 * some unrelated action touches that operator. Closes the loop with the
 * ready-to-connect email (login link, no separate password step).
 */
export async function backfillOneWaitingOperator(prisma: PrismaClient): Promise<BackfillResult> {
  const waiting = await findOldestWaitingOperator(prisma);
  if (!waiting) return { backfilled: false, reason: "no-one-waiting" };

  const channel = waiting.channelConnections[0];
  if (!channel) return { backfilled: false, reason: "no-one-waiting" };

  const claim = await claimAvailableFlow(prisma, waiting.id);
  if (!claim.assigned) return { backfilled: false, reason: "pool-empty" };

  await prisma.channelConnection.update({
    where: { id: channel.id },
    data: { manychatConnectUrl: claim.connectUrl },
  });

  const token = await createLoginToken(prisma, waiting.id);
  const loginUrl = `${appBaseUrl()}/login/verify?token=${token}`;
  await sendReadyToConnectEmail({ to: waiting.email, loginUrl });

  return { backfilled: true, operatorId: waiting.id };
}
