import type { PrismaClient } from "../generated/prisma/client";
import type { BillingProvider } from "./billing";
import { mapStripeStatus } from "./billing";
import type { CalendarProvider } from "./calendar";
import type { ChannelProvider } from "./channel";
import { emitEvent } from "./events";
import { claimAvailableFlow } from "./manychatPool";
import { CONNECTED, evaluateReadiness } from "./readiness";

// Orchestration that touches the DB: recompute readiness across an operator's
// roles using the single source of truth, persist gate state, and fire WentLive
// exactly once when the operator first becomes live. Billing operations below
// update billingStatus from real Stripe state and then re-run this recompute,
// so gateBilling always flows through evaluateReadiness().

export type RecomputeResult = {
  operatorLive: boolean;
  wentLiveFired: boolean;
  roles: { roleId: string; readinessState: string }[];
};

/**
 * Recompute every role's gates from current connection + template + billing
 * state, persist them, and emit WentLive if the operator just went live.
 * An operator is "live" when it has at least one role whose four gates are all
 * true (platform + calendar + template + billing).
 */
export async function recomputeOperatorReadiness(
  prisma: PrismaClient,
  operatorId: string,
): Promise<RecomputeResult> {
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: {
        include: {
          calendarConnections: true,
          roles: { include: { screeningTemplate: true } },
        },
      },
    },
  });

  // Operator-level channel: connected if any channel reports "connected".
  const channelStatus = operator.channelConnections.some((c) => c.status === CONNECTED)
    ? CONNECTED
    : (operator.channelConnections[0]?.status ?? null);

  const roleResults: { roleId: string; readinessState: string }[] = [];

  for (const location of operator.locations) {
    const calendarStatus = location.calendarConnections.some((c) => c.status === CONNECTED)
      ? CONNECTED
      : (location.calendarConnections[0]?.status ?? null);

    for (const role of location.roles) {
      const readiness = evaluateReadiness({
        channelStatus,
        calendarStatus,
        template: role.screeningTemplate,
        billingStatus: operator.billingStatus,
      });
      await prisma.role.update({ where: { id: role.id }, data: readiness });
      roleResults.push({ roleId: role.id, readinessState: readiness.readinessState });
    }
  }

  const operatorLive = roleResults.some((r) => r.readinessState === "live");

  // WentLive fires only on the transition into live — and only once per operator
  // (emitEvent is idempotent via the DB unique constraint).
  let wentLiveFired = false;
  if (operatorLive) {
    const res = await emitEvent(prisma, {
      operatorId,
      type: "WentLive",
      payload: { liveRoles: roleResults.filter((r) => r.readinessState === "live").map((r) => r.roleId) },
    });
    wentLiveFired = res.fired;
  }

  return { operatorLive, wentLiveFired, roles: roleResults };
}

// --- Billing lifecycle operations -------------------------------------------

/**
 * Create the Stripe customer (if needed) and a 2-week trial subscription
 * ($199/mo per location), advance billingStatus to the real Stripe state, then
 * recompute readiness so gateBilling reflects it. Does NOT make the instance
 * live on its own (channel/calendar still gate that).
 */
export async function startTrial(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
) {
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: { _count: { select: { locations: true } } },
  });

  const customerId =
    operator.stripeCustomerId ??
    (await billing.createCustomer({
      email: operator.email, // real email when provided at provision; else @pending
      name: operator.name,
      operatorId,
    })).customerId;

  const sub = await billing.createTrialSubscription({
    customerId,
    quantity: Math.max(1, operator._count.locations),
  });

  const billingStatus = mapStripeStatus(sub.stripeStatus);
  await prisma.operator.update({
    where: { id: operatorId },
    data: { stripeCustomerId: customerId, stripeSubscriptionId: sub.subscriptionId, billingStatus },
  });

  const recompute = await recomputeOperatorReadiness(prisma, operatorId);
  return { customerId, subscriptionId: sub.subscriptionId, billingStatus, recompute };
}

// --- Founding annual ($1,990 one-time, paid from day one, no trial) ----------

/**
 * Real count of founding operators who have actually paid — the single
 * source of truth for both the landing page's scarcity counter (read-only)
 * and the checkout-time cap (src/app/onboarding/actions.ts). Only counts
 * `billingStatus: "active"` (webhook-confirmed payment), never
 * `trial_pending` — an abandoned Stripe session must not eat a real seat.
 * Requires `stripeLivemode: true` — a webhook-confirmed payment made with a
 * Stripe TEST key must not eat a real seat either. This is structural (every
 * confirmed payment is stamped with Stripe's own event.livemode at
 * confirmation time, see confirmFoundingPayment below) rather than relying on
 * remembering to purge test signups — manual cleanup already failed once.
 * Also excludes synthetic test emails as defense-in-depth so any record
 * created outside confirmFoundingPayment (e.g. a smoke script) can't skew a
 * number that gates a real public promise ("first 10 only").
 */
export async function countActiveFoundingOperators(prisma: PrismaClient): Promise<number> {
  return prisma.operator.count({
    where: {
      plan: "founding_annual",
      billingStatus: "active",
      stripeLivemode: true,
      NOT: [{ email: { endsWith: "@pending.afra.local" } }, { email: { endsWith: "@smoke.test" } }],
    },
  });
}

/**
 * Create the Stripe-hosted Checkout Session for the founding charge and persist
 * the session/customer ids. Marks plan="founding_annual" but DOES NOT touch
 * billingStatus — it stays "trial_pending" (unpaid) until a webhook-confirmed
 * payment flips it to "active". Returns the hosted URL to redirect to. The card
 * is entered on Stripe's page; our code never sees it.
 */
export async function startFoundingCheckout(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
  urls: { successUrl: string; cancelUrl: string },
) {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  const { checkoutUrl, sessionId, customerId } = await billing.createFoundingCheckout({
    operatorId,
    email: operator.email,
    name: operator.name,
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
  });
  await prisma.operator.update({
    where: { id: operatorId },
    data: {
      plan: "founding_annual",
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: sessionId,
      // billingStatus intentionally unchanged: still "trial_pending" (unpaid).
    },
  });
  return { checkoutUrl, sessionId };
}

/**
 * Confirm a founding payment — THE webhook path (checkout.session.completed /
 * payment_intent.succeeded). This is the ONLY thing that flips a founding
 * operator to billingStatus="active", and it must be driven by a verified Stripe
 * webhook, never a browser redirect. Idempotent: re-confirming stays "active".
 * Recompute keeps gateBilling honest via evaluateReadiness() — paying flips
 * gateBilling, NOT the channel/calendar gates.
 */
export async function confirmFoundingPayment(
  prisma: PrismaClient,
  operatorId: string,
  ids: {
    customerId?: string | null;
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
    /** Stripe's own event.livemode from the verified webhook event. Required
     * to feed countActiveFoundingOperators()'s cap-enforcing filter — every
     * caller must pass a real boolean, not omit it, so a confirmed payment is
     * never silently left ambiguous between test and live. */
    livemode: boolean;
  },
) {
  const op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  await prisma.operator.update({
    where: { id: operatorId },
    data: {
      billingStatus: "active",
      plan: "founding_annual",
      stripeCustomerId: ids.customerId ?? op.stripeCustomerId,
      stripePaymentIntentId: ids.paymentIntentId ?? op.stripePaymentIntentId,
      stripeCheckoutSessionId: ids.checkoutSessionId ?? op.stripeCheckoutSessionId,
      stripeLivemode: ids.livemode,
    },
  });
  const recompute = await recomputeOperatorReadiness(prisma, operatorId);

  // Post-payment hook (does NOT affect billingStatus/gateBilling above, which
  // is already committed by this point): try to hand the operator an instant
  // "Connect Instagram" by claiming a pre-built flow from the pool. Failure
  // here — pool empty, no channel row, anything — must never surface as a
  // payment error; the operator has already paid and is already "active".
  const assignment = await tryAssignFlow(prisma, operatorId);

  return { billingStatus: "active", recompute, flowAssignment: assignment };
}

export type FlowAssignmentOutcome =
  | { assigned: true }
  | { assigned: false; reason: "already-assigned" | "no-channel" | "pool-empty" | "error" };

/**
 * Idempotent: re-confirming an already-paid operator (webhook retries do
 * happen) must not attempt a second claim. Guarded by checking for an
 * existing manychatConnectUrl first — if one's already set (from an earlier
 * confirm, or the founder setting it by hand), this is a no-op.
 */
async function tryAssignFlow(prisma: PrismaClient, operatorId: string): Promise<FlowAssignmentOutcome> {
  try {
    const channel = await prisma.channelConnection.findFirst({ where: { operatorId } });
    if (!channel) return { assigned: false, reason: "no-channel" };
    if (channel.manychatConnectUrl) return { assigned: false, reason: "already-assigned" };

    const claim = await claimAvailableFlow(prisma, operatorId);
    if (!claim.assigned) {
      console.warn(`[manychatPool] pool empty at payment time for operator ${operatorId} — awaiting-setup fallback applies`);
      return { assigned: false, reason: "pool-empty" };
    }

    await prisma.channelConnection.update({
      where: { id: channel.id },
      data: { manychatConnectUrl: claim.connectUrl },
    });
    return { assigned: true };
  } catch (err) {
    console.error(`[manychatPool] flow assignment failed for operator ${operatorId}:`, err);
    return { assigned: false, reason: "error" };
  }
}

/** Cancel the subscription, reflect "canceled", recompute (gateBilling -> false). */
export async function cancelBilling(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
) {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  if (!operator.stripeSubscriptionId) throw new Error("No subscription to cancel");

  const { stripeStatus } = await billing.cancelSubscription(operator.stripeSubscriptionId);
  const billingStatus = mapStripeStatus(stripeStatus);
  await prisma.operator.update({ where: { id: operatorId }, data: { billingStatus } });

  const recompute = await recomputeOperatorReadiness(prisma, operatorId);
  return { billingStatus, recompute };
}

/** Attach/replace the default payment method for the operator's customer. */
export async function updateCard(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
  paymentMethodId: string,
) {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  if (!operator.stripeCustomerId) throw new Error("No customer to update");
  await billing.updateDefaultPaymentMethod({
    customerId: operator.stripeCustomerId,
    paymentMethodId,
  });
  return { ok: true as const };
}

// --- Integration connect (B1/B2 drop-in seam) -------------------------------
// These call the channel/calendar provider's connect(), persist whatever status
// it reports, then recompute readiness. With the STUB providers nothing flips
// (status stays "stubbed") so the instance stays honest/not-live. When a REAL
// provider is configured, connect() returns "connected" and the recompute can
// fire WentLive — no caller changes needed. The orchestrator is the only DB
// writer, keeping providers DB-agnostic like BillingProvider.

export async function connectChannel(
  prisma: PrismaClient,
  provider: ChannelProvider,
  channelConnectionId: string,
) {
  const conn = await prisma.channelConnection.findUniqueOrThrow({ where: { id: channelConnectionId } });
  const res = await provider.connect({ channelConnectionId });
  await prisma.channelConnection.update({
    where: { id: channelConnectionId },
    data: { status: res.status, pageId: res.pageId ?? conn.pageId },
  });
  const recompute = await recomputeOperatorReadiness(prisma, conn.operatorId);
  return { status: res.status, recompute };
}

export async function connectCalendar(
  prisma: PrismaClient,
  provider: CalendarProvider,
  calendarConnectionId: string,
) {
  const conn = await prisma.calendarConnection.findUniqueOrThrow({
    where: { id: calendarConnectionId },
    include: { location: { select: { operatorId: true } } },
  });
  const res = await provider.connect({ calendarConnectionId });
  await prisma.calendarConnection.update({
    where: { id: calendarConnectionId },
    data: { status: res.status, calendarId: res.calendarId ?? conn.calendarId },
  });
  const recompute = await recomputeOperatorReadiness(prisma, conn.location.operatorId);
  return { status: res.status, recompute };
}

/**
 * Apply a Stripe subscription status to an operator (the dunning / webhook path).
 * e.g. an invoice.payment_failed webhook -> "past_due" -> gateBilling flips false.
 */
export async function applyStripeStatus(
  prisma: PrismaClient,
  operatorId: string,
  stripeStatus: string,
) {
  const billingStatus = mapStripeStatus(stripeStatus);
  await prisma.operator.update({ where: { id: operatorId }, data: { billingStatus } });
  const recompute = await recomputeOperatorReadiness(prisma, operatorId);
  return { billingStatus, recompute };
}
