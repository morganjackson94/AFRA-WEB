import type { PrismaClient } from "../generated/prisma/client";
import type { BillingProvider } from "./billing";
import { mapStripeStatus } from "./billing";
import type { CalendarProvider } from "./calendar";
import type { ChannelProvider } from "./channel";
import { createLoginToken } from "./auth";
import { emitEvent } from "./events";
import { sendTrialEndedEmail, sendWelcomeAssignedEmail, sendWelcomeAwaitingSetupEmail, sendYoureLiveEmail, sendYoureLiveLowReachEmail } from "./mail";
import { claimAvailableFlow } from "./manychatPool";
import { CONNECTED, evaluateReadiness } from "./readiness";

// Day-20 check-in fuse (see the checkin job, /api/jobs/run-scheduled-emails).
const CHECKIN_DELAY_MS = 20 * 24 * 60 * 60 * 1000;

// Duplicated from session.ts's appBaseUrl() rather than imported: session.ts
// pulls in next/headers (cookies()), which this module can't depend on — it's
// imported by plain-tsx smoke scripts (founding-smoke.ts etc.) that run
// outside the Next.js request runtime, not just by app routes.
function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

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

// --- Founding subscription ($399/mo, first 20 screened candidates free, 60-day cap) ----------

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
 * Confirm a founding checkout completed — THE webhook path
 * (checkout.session.completed). Re-fetches the subscription's LIVE status
 * from Stripe and writes THAT, rather than assuming "trialing" — Stripe is
 * authoritative, not this event's payload. Must be driven by a verified
 * Stripe webhook, never a browser redirect.
 *
 * Genuinely idempotent, not just claimed to be: this used to hardcode
 * billingStatus="trialing" unconditionally on every call, which meant a
 * stale or duplicate delivery of this same event — a dashboard resend of an
 * already-processed checkout.session.completed, concretely — silently
 * resurrected a CANCELED subscription back to "trialing" in Postgres while
 * Stripe correctly still showed "canceled". Re-fetching means a stale replay
 * now reconciles to whatever Stripe says right now instead of overwriting
 * newer truth with an old event's assumption. Confirmation side effects
 * (flow assignment, welcome email, the check-in fuse) only run when the live
 * status is a genuine new confirmation ("trialing" OR "active" — a checkout
 * can legitimately resolve to "active" with no trial applied; see
 * isGenuineConfirmation below) — a stale replay against an
 * already-resolved subscription reconciles billingStatus but does not
 * re-trigger onboarding.
 *
 * The trial's own end (candidate cap or the 60-day backstop) is reconciled
 * separately, in ONE shared place — applyStripeStatus below — not here.
 */
export async function confirmFoundingPayment(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
  ids: {
    customerId?: string | null;
    subscriptionId?: string | null;
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

  // Prefer the id this event carries; fall back to what's already on file (a
  // webhook retry that omits it, or an idempotent re-confirm call, still has
  // something to re-fetch against). A completed subscription-mode Checkout
  // Session always has session.subscription populated by the time
  // checkout.session.completed fires — Stripe creates the subscription
  // synchronously as part of completing the session — so if NEITHER is
  // present, this event is malformed/unexpected: throw so Stripe retries
  // rather than silently confirming a payment with nothing to verify against.
  const subscriptionId = ids.subscriptionId ?? op.stripeSubscriptionId;
  if (!subscriptionId) {
    throw new Error(`confirmFoundingPayment: no subscriptionId for operator ${operatorId} — cannot verify live status`);
  }

  // Stripe is authoritative: let a failed fetch propagate (non-2xx -> Stripe
  // retries) rather than falling back to a value derived from the event
  // payload — that fallback is exactly the bug this guards against, and it
  // would resurface silently, specifically when Stripe is briefly
  // unreachable, i.e. exactly when nobody would notice.
  const { stripeStatus } = await billing.getSubscriptionStatus(subscriptionId);
  const billingStatus = mapStripeStatus(stripeStatus);

  await prisma.operator.update({
    where: { id: operatorId },
    data: {
      billingStatus,
      plan: "founding_annual",
      stripeCustomerId: ids.customerId ?? op.stripeCustomerId,
      stripeSubscriptionId: subscriptionId,
      stripePaymentIntentId: ids.paymentIntentId ?? op.stripePaymentIntentId,
      stripeCheckoutSessionId: ids.checkoutSessionId ?? op.stripeCheckoutSessionId,
      stripeLivemode: ids.livemode,
      // Day-20 check-in fuse (see /api/jobs/run-scheduled-emails) — a
      // personal how's-it-going touch, independent of the trial mechanics
      // above. Set once, here, at checkout completion — never overwritten on
      // a webhook retry since checkinEmailDueAt isn't read from `op` above
      // (it would already be set on a retry, but re-setting it to the same
      // ~20-days-from-now math on every retry would be harmless anyway;
      // guarded to only set it the first time regardless, so a delayed retry
      // can't push it out).
      ...(op.checkinEmailDueAt ? {} : { checkinEmailDueAt: new Date(Date.now() + CHECKIN_DELAY_MS) }),
    },
  });
  const recompute = await recomputeOperatorReadiness(prisma, operatorId);

  // Confirmation side effects only make sense for a subscription that is
  // genuinely newly starting — "trialing" (the normal case) or "active" (no
  // trial applied: already consumed one, or a future config change) both
  // count. Anything else (past_due, canceled, incomplete) means this event is
  // stale/out of order relative to what's already happened to the
  // subscription — the billingStatus write above already reconciled to
  // truth; there's nothing left to "confirm."
  const isGenuineConfirmation = billingStatus === "trialing" || billingStatus === "active";

  let assignment: FlowAssignmentOutcome = { assigned: false, reason: "stale-confirmation" };
  let welcomeEmail: WelcomeEmailOutcome = { sent: false, reason: "stale-confirmation" };
  if (isGenuineConfirmation) {
    // Post-checkout hook (does NOT affect billingStatus/gateBilling above,
    // which is already committed by this point): try to hand the operator an
    // instant "Connect Instagram" by claiming a pre-built flow from the pool.
    // Failure here — pool empty, no channel row, anything — must never
    // surface as a checkout error; the operator's trial has already started.
    assignment = await tryAssignFlow(prisma, operatorId);

    // Welcome email — the operator's first owned touch after checkout.
    // Branches on whether tryAssignFlow above actually got them a connect
    // action. Same non-blocking guarantee as tryAssignFlow: nothing in here
    // may throw across this function or affect billingStatus.
    welcomeEmail = await sendWelcomeEmailOnce(prisma, operatorId, ids.livemode, assignment.assigned);
  }

  return { billingStatus, recompute, flowAssignment: assignment, welcomeEmail };
}

export type FlowAssignmentOutcome =
  | { assigned: true }
  | { assigned: false; reason: "already-assigned" | "no-channel" | "pool-empty" | "error" | "stale-confirmation" };

export type WelcomeEmailOutcome =
  | { sent: true; variant: "assigned" | "awaiting-setup" }
  | { sent: false; reason: "not-livemode" | "already-sent" | "stub" | "error" | "stale-confirmation" };

/**
 * Fires the post-payment welcome email exactly once per operator, never
 * blocking payment confirmation. Two independent guards:
 *   1. livemode — a Stripe TEST-mode confirmation (including the founding
 *      live-mode E2E test) never sends by default. SEND_TEST_WELCOME_EMAIL=1
 *      is an explicit, unset-by-default opt-in for deliberately testing the
 *      email itself in dev; production never sets it.
 *   2. welcomeEmailSentAt — claimed atomically via updateMany guarded on it
 *      still being null (same idiom as claimAvailableFlow in
 *      manychatPool.ts), set BEFORE the send itself, so a webhook retry (or a
 *      race between retries) can never trigger a second send.
 * Branches on flowAssigned: variant A (assigned) tells the operator to
 * connect Instagram now; variant B (awaiting-setup) does not — there's
 * nothing to click yet — and forward-references the existing
 * sendReadyToConnectEmail without duplicating it.
 */
async function sendWelcomeEmailOnce(
  prisma: PrismaClient,
  operatorId: string,
  livemode: boolean,
  flowAssigned: boolean,
): Promise<WelcomeEmailOutcome> {
  if (!livemode && process.env.SEND_TEST_WELCOME_EMAIL !== "1") {
    return { sent: false, reason: "not-livemode" };
  }

  const claim = await prisma.operator.updateMany({
    where: { id: operatorId, welcomeEmailSentAt: null },
    data: { welcomeEmailSentAt: new Date() },
  });
  if (claim.count === 0) return { sent: false, reason: "already-sent" };

  const variant = flowAssigned ? ("assigned" as const) : ("awaiting-setup" as const);
  try {
    const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
    const token = await createLoginToken(prisma, operatorId);
    const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
    console.log(`[welcome-email] attempting send (variant=${variant}) to operator ${operatorId}`);
    const result = flowAssigned
      ? await sendWelcomeAssignedEmail({ to: operator.email, dashboardUrl })
      : await sendWelcomeAwaitingSetupEmail({ to: operator.email, dashboardUrl });
    if (result.sent) {
      console.log(`[welcome-email] sent (variant=${variant}) to operator ${operatorId}`);
    } else {
      console.error(`[welcome-email] send did not complete for operator ${operatorId} (stub=${result.stub ?? false})`);
    }
    return result.sent ? { sent: true, variant } : { sent: false, reason: result.stub ? "stub" : "error" };
  } catch (err) {
    console.error(`[mail] welcome email send failed for operator ${operatorId}:`, err);
    return { sent: false, reason: "error" };
  }
}

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
  const wasConnected = conn.status === CONNECTED;
  const res = await provider.connect({ channelConnectionId });
  await prisma.channelConnection.update({
    where: { id: channelConnectionId },
    data: { status: res.status, pageId: res.pageId ?? conn.pageId },
  });
  const recompute = await recomputeOperatorReadiness(prisma, conn.operatorId);

  // "You're live" email — fires from this single shared orchestrator so it
  // fires identically no matter which caller/path triggers a connect (today:
  // the founder-confirm route; later: a real OAuth callback). Only on a
  // genuine transition into "connected", never on a no-op re-confirm (e.g.
  // the founder-confirm route being called again just to set
  // manychatSubscriberId). Never blocks the connect response.
  let liveEmail: LiveEmailOutcome = { sent: false, reason: "no-transition" };
  if (!wasConnected && res.status === CONNECTED) {
    liveEmail = await sendLiveEmailOnce(prisma, conn.operatorId);
  }

  return { status: res.status, recompute, liveEmail };
}

export type LiveEmailOutcome =
  | { sent: true; variant: "normal-reach" | "low-reach" }
  | { sent: false; reason: "no-transition" | "already-sent" | "stub" | "error" };

/**
 * Fires the "you're live" email exactly once per operator, on the channel's
 * first genuine transition to connected. Idempotency-claimed via
 * liveEmailSentAt (same claim-before-send idiom as sendWelcomeEmailOnce
 * above), and wrapped so a send failure can never surface as a connect error.
 * Branches on the operator's own reachFlag (qualification.ts) — concierge
 * context only, never a rejection.
 */
async function sendLiveEmailOnce(prisma: PrismaClient, operatorId: string): Promise<LiveEmailOutcome> {
  const claim = await prisma.operator.updateMany({
    where: { id: operatorId, liveEmailSentAt: null },
    data: { liveEmailSentAt: new Date() },
  });
  if (claim.count === 0) return { sent: false, reason: "already-sent" };

  try {
    const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
    const token = await createLoginToken(prisma, operatorId);
    const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
    const lowReach = operator.reachFlag;
    console.log(`[live-email] attempting send (lowReach=${lowReach}) to operator ${operatorId}`);
    const result = lowReach
      ? await sendYoureLiveLowReachEmail({ to: operator.email, dashboardUrl })
      : await sendYoureLiveEmail({ to: operator.email, dashboardUrl });
    if (result.sent) {
      console.log(`[live-email] sent (lowReach=${lowReach}) to operator ${operatorId}`);
    } else {
      console.error(`[live-email] send did not complete for operator ${operatorId} (stub=${result.stub ?? false})`);
    }
    return result.sent
      ? { sent: true, variant: lowReach ? "low-reach" : "normal-reach" }
      : { sent: false, reason: result.stub ? "stub" : "error" };
  } catch (err) {
    console.error(`[mail] live email send failed for operator ${operatorId}:`, err);
    return { sent: false, reason: "error" };
  }
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

export type TrialEndedEmailOutcome =
  | { sent: true }
  | { sent: false; reason: "already-sent" | "stub" | "error" };

/**
 * Reconcile an operator's billingStatus against Stripe — the dunning/webhook
 * path (e.g. invoice.payment_failed's transition -> gateBilling flips false),
 * shared by BOTH the founding/subscription-trial plan and the separate,
 * dead-but-still-present per-location monthly plan (its own unrelated 14-day
 * trial, PRICE_PER_LOCATION_CENTS in billing.ts).
 *
 * Re-fetches the subscription's LIVE status from Stripe via
 * operator.stripeSubscriptionId rather than trusting the caller's claimed
 * status — the caller's payload can be stale (a duplicate/out-of-order
 * webhook delivery carrying an old status; see confirmFoundingPayment's
 * matching guard, added for the same reason after a stale replay overwrote a
 * canceled subscription back to "trialing"). Two failure modes, both
 * deliberate:
 *   - No stripeSubscriptionId yet persisted: a real, expected ordering race
 *     (e.g. customer.subscription.created landing before
 *     checkout.session.completed has persisted the id — Stripe doesn't
 *     guarantee delivery order). Nothing to re-fetch, nothing to reconcile
 *     yet; no-op rather than guessing or throwing — the other event resolves
 *     this once it lands.
 *   - The Stripe fetch itself throws: propagate it. A non-2xx response makes
 *     Stripe retry, which is correct; catching this and falling back to the
 *     caller's claimed status would silently reintroduce the exact bug this
 *     function now guards against, specifically when Stripe is unreachable —
 *     exactly when nobody would notice.
 *
 * For plan === "founding_annual" specifically, this is ALSO the single
 * shared reconciliation point for BOTH ways that trial can end: hitting the
 * candidate cap early (endTrialForCandidateCap below calls Stripe, which
 * fires a webhook that lands here) and Stripe's own natural 60-day backstop
 * (trial_period_days on the subscription — no app code triggers it, but it
 * fires the exact same customer.subscription.updated webhook, which also
 * lands here). Both causes are indistinguishable by the time they reach this
 * function, which is deliberate: it guarantees trialEndedAt and the
 * trial-ended email fire exactly once, from one place, regardless of which
 * cause ended the trial. The plan check below keeps this behavior scoped to
 * that plan only — the per-location plan's own trialing->past_due dunning
 * transition must not be mistaken for the same event (their trials are
 * unrelated mechanisms with unrelated copy).
 */
export async function applyStripeStatus(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
) {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });

  if (!operator.stripeSubscriptionId) {
    const recompute = await recomputeOperatorReadiness(prisma, operatorId);
    return { billingStatus: operator.billingStatus, recompute, trialEndedEmail: undefined };
  }

  const { stripeStatus } = await billing.getSubscriptionStatus(operator.stripeSubscriptionId);
  const billingStatus = mapStripeStatus(stripeStatus);
  const justEndedTrial =
    operator.plan === "founding_annual" &&
    operator.billingStatus === "trialing" &&
    billingStatus !== "trialing" &&
    !operator.trialEndedAt;

  await prisma.operator.update({
    where: { id: operatorId },
    data: { billingStatus, ...(justEndedTrial ? { trialEndedAt: new Date() } : {}) },
  });
  const recompute = await recomputeOperatorReadiness(prisma, operatorId);
  const trialEndedEmail = justEndedTrial ? await sendTrialEndedEmailOnce(prisma, operatorId) : undefined;
  return { billingStatus, recompute, trialEndedEmail };
}

/**
 * The candidate-cap trigger for ending a trial early (see FREE_CANDIDATE_CAP,
 * billing.ts). Deliberately does nothing but call Stripe: no DB writes, no
 * email. Every state change (billingStatus, trialEndedAt, the trial-ended
 * email) happens when the resulting webhook lands in applyStripeStatus above
 * — this function's only job is to be the thing that makes that webhook fire.
 * Re-checks billingStatus/stripeSubscriptionId defensively in case of a race
 * with a second candidate crossing the threshold concurrently.
 */
export async function endTrialForCandidateCap(
  prisma: PrismaClient,
  billing: BillingProvider,
  operatorId: string,
): Promise<void> {
  const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  if (operator.billingStatus !== "trialing" || !operator.stripeSubscriptionId) return;
  await billing.endTrialNow(operator.stripeSubscriptionId);
}

/**
 * Fires the trial-ended email exactly once per operator, the moment
 * applyStripeStatus detects a trialing -> non-trialing transition (candidate
 * cap or the 60-day backstop — see that function's doc comment). Same
 * claim-before-send idiom as sendWelcomeEmailOnce/sendLiveEmailOnce.
 */
async function sendTrialEndedEmailOnce(
  prisma: PrismaClient,
  operatorId: string,
): Promise<TrialEndedEmailOutcome> {
  const claim = await prisma.operator.updateMany({
    where: { id: operatorId, trialEndedEmailSentAt: null },
    data: { trialEndedEmailSentAt: new Date() },
  });
  if (claim.count === 0) return { sent: false, reason: "already-sent" };

  try {
    const operator = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
    const token = await createLoginToken(prisma, operatorId);
    const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
    console.log(`[trial-ended-email] attempting send to operator ${operatorId}`);
    const result = await sendTrialEndedEmail({ to: operator.email, dashboardUrl });
    if (result.sent) {
      console.log(`[trial-ended-email] sent to operator ${operatorId}`);
    } else {
      console.error(`[trial-ended-email] send did not complete for operator ${operatorId} (stub=${result.stub ?? false})`);
    }
    return result.sent ? { sent: true } : { sent: false, reason: result.stub ? "stub" : "error" };
  } catch (err) {
    console.error(`[mail] trial-ended email send failed for operator ${operatorId}:`, err);
    return { sent: false, reason: "error" };
  }
}
