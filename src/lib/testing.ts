import type { PrismaClient } from "../generated/prisma/client";
import { CONNECTED } from "./readiness";

// TEST-ONLY fixtures. Not used by production code paths — these simulate the
// real B1/B2 integrations reporting "connected" so we can prove WentLive fires.

/**
 * Flip an operator's stubbed channel + every location's stubbed calendar to
 * "connected", as the real Meta/Google integrations eventually will. Does not
 * recompute readiness — call recomputeOperatorReadiness() afterward to observe
 * the transition through the real code path.
 */
export async function connectStubbedIntegrations(
  prisma: PrismaClient,
  operatorId: string,
): Promise<void> {
  await prisma.channelConnection.updateMany({
    where: { operatorId },
    data: { status: CONNECTED },
  });
  await prisma.calendarConnection.updateMany({
    where: { location: { operatorId } },
    data: { status: CONNECTED },
  });
}
