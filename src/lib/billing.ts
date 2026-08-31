import Stripe from "stripe";

// Billing provider boundary. Real Stripe (test mode) when STRIPE_SECRET_KEY is
// set; otherwise a deterministic in-memory fake so the system is fully runnable
// and testable offline. Same swap-the-stub discipline as the channel/calendar.

export const PRICE_PER_LOCATION_CENTS = 19900; // $199/mo per location (monthly path)
export const TRIAL_DAYS = 14; // 2-week free trial (monthly path only)
// $4,788/yr flat, all locations, one standing recurring subscription price
// (see docs/CLAIMS.md). Repriced again: the $399/mo subscription (itself a
// prior August 2026 repricing, which replaced an even earlier one-time
// $4,788/yr charge) is now a recurring ANNUAL price instead — same trial
// mechanism (FREE_CANDIDATE_CAP/TRIAL_DAYS_BACKSTOP below, unchanged), same
// genuine-trial reasoning (a subscription, not a one-time charge, is what
// makes a trial possible at all), just a longer commitment per renewal.
// Stripe renews this natively (interval: "year") — nothing in this file
// drives renewal.
export const ANNUAL_PRICE_CENTS = 478800;
// The trial: free until the operator has had this many candidates reach
// "screened" or beyond (see Candidate.countedTowardTrial, incremented in
// ingestScreeningResult, manychat.ts), or TRIAL_DAYS_BACKSTOP days pass,
// whichever comes first. The 60-day backstop needs no app code of its own —
// it's enforced by Stripe's own trial_period_days on the subscription
// (createFoundingCheckout below); the candidate-cap trigger is the other,
// app-driven way a trial can end, via endTrialNow. Both converge on the same
// Stripe event (customer.subscription.updated) and the same reconciliation
// path (applyStripeStatus, activation.ts) — see docs/CLAIMS.md.
export const FREE_CANDIDATE_CAP = 20;
export const TRIAL_DAYS_BACKSTOP = 60;
// Internal capacity gate only — no longer a marketed "first N only" cohort
// (that ended with the August 2026 repricing). Kept as an operational
// safety valve; see countActiveFoundingOperators() in activation.ts, which
// enforces this against real billingStatus="active" data (src/app/onboarding/
// actions.ts blocks checkout once it's reached). If it ever fires, the
// decline message must read as generic capacity/waitlist language — nothing
// customer-facing should reference this number.
export const FOUNDING_SPOTS_TOTAL = 10;

/** Maps a raw Stripe subscription status to our Operator.billingStatus vocabulary. */
export function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "trial_pending";
    default:
      return "trial_pending";
  }
}

export interface BillingProvider {
  readonly mode: "stripe" | "fake";
  createCustomer(args: {
    email: string;
    name?: string;
    operatorId: string;
  }): Promise<{ customerId: string }>;
  createTrialSubscription(args: {
    customerId: string;
    quantity?: number;
  }): Promise<{ subscriptionId: string; stripeStatus: string }>;
  cancelSubscription(subscriptionId: string): Promise<{ stripeStatus: string }>;
  updateDefaultPaymentMethod(args: {
    customerId: string;
    paymentMethodId: string;
  }): Promise<{ ok: true }>;
  getSubscriptionStatus(subscriptionId: string): Promise<{ stripeStatus: string; trialEnd: number | null }>;

  /**
   * Create a Stripe-HOSTED Checkout Session for the $4,788/yr subscription,
   * with a trial (see TRIAL_DAYS_BACKSTOP) so nothing is charged until the
   * trial ends. The operator enters their card on Stripe's page (required
   * up front — subscription-mode Checkout collects a payment method by
   * default even during a trial) — our code never sees raw card data.
   * Returns the hosted URL to redirect to, plus the session + customer ids
   * we persist for webhook matching. mode = "subscription", WITH a trial —
   * despite the name, this is no longer a one-time "founding" charge; the
   * function/field names here are pre-existing internal identifiers kept
   * unchanged (not customer-facing, not renamed as part of the repricing —
   * see docs/CLAIMS.md).
   */
  createFoundingCheckout(args: {
    operatorId: string;
    email: string;
    name?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string; sessionId: string; customerId: string }>;

  /**
   * Read-only lookup of what a completed Checkout Session actually charged.
   * Under the trial model this is legitimately 0 at signup (nothing is
   * charged until the trial ends) — callers must not treat it as "the real
   * charged amount" the way the retired one-time-charge model did. Returns
   * null if the session can't be found/read. Never mutates anything.
   *
   * No longer read by /welcome (it fires Meta's StartTrial with value: 0
   * unconditionally now, not a real charged amount). The trial->paid
   * conversion pixel event (the real revenue signal) is a deliberately
   * descoped fast-follow — the existing "redirect to a page that fires
   * client-side fbq" pattern has no equivalent for an async webhook event
   * (candidate cap or the 60-day backstop) with nobody on a page; the correct
   * long-term fix is server-side Conversions API, not built here.
   */
  getCheckoutSessionAmount(sessionId: string): Promise<{ amountTotal: number; currency: string } | null>;

  /**
   * End a subscription's trial immediately (the candidate-cap trigger — see
   * FREE_CANDIDATE_CAP). Does nothing else: no DB writes, no email. The
   * resulting Stripe status change is picked up by the webhook and
   * reconciled in ONE shared place, applyStripeStatus (activation.ts), the
   * same place the OTHER trial-end trigger (Stripe's own 60-day backstop)
   * lands — so both causes always produce identical, non-duplicated effects.
   */
  endTrialNow(subscriptionId: string): Promise<{ stripeStatus: string }>;
}

// --- Real Stripe (test mode) -------------------------------------------------

export class StripeBillingProvider implements BillingProvider {
  readonly mode = "stripe" as const;
  private stripe: Stripe;
  private productId?: string;
  private foundingProductId?: string;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  /** The recurring price's product. Reuses STRIPE_PRODUCT_ID or creates one once. */
  private async ensureProductId(): Promise<string> {
    if (this.productId) return this.productId;
    if (process.env.STRIPE_PRODUCT_ID) {
      this.productId = process.env.STRIPE_PRODUCT_ID;
      return this.productId;
    }
    const product = await this.stripe.products.create({
      name: "AFRA — per location",
    });
    this.productId = product.id;
    return this.productId;
  }

  async createCustomer(args: { email: string; name?: string; operatorId: string }) {
    const customer = await this.stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: { operatorId: args.operatorId },
    });
    return { customerId: customer.id };
  }

  async createTrialSubscription(args: { customerId: string; quantity?: number }) {
    // A pre-made price id wins; otherwise build price_data against our product.
    const priceId = process.env.STRIPE_PRICE_ID;
    const item: Stripe.SubscriptionCreateParams.Item = priceId
      ? { price: priceId, quantity: args.quantity ?? 1 }
      : {
          quantity: args.quantity ?? 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_PER_LOCATION_CENTS,
            recurring: { interval: "month" },
            product: await this.ensureProductId(),
          },
        };
    const sub = await this.stripe.subscriptions.create({
      customer: args.customerId,
      items: [item],
      trial_period_days: TRIAL_DAYS,
      // Trial with no card up front; if none added by trial end, cancel cleanly.
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      payment_behavior: "default_incomplete",
    });
    return { subscriptionId: sub.id, stripeStatus: sub.status };
  }

  async cancelSubscription(subscriptionId: string) {
    const sub = await this.stripe.subscriptions.cancel(subscriptionId);
    return { stripeStatus: sub.status };
  }

  async updateDefaultPaymentMethod(args: { customerId: string; paymentMethodId: string }) {
    await this.stripe.paymentMethods.attach(args.paymentMethodId, {
      customer: args.customerId,
    });
    await this.stripe.customers.update(args.customerId, {
      invoice_settings: { default_payment_method: args.paymentMethodId },
    });
    return { ok: true as const };
  }

  async getSubscriptionStatus(subscriptionId: string) {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    return { stripeStatus: sub.status, trialEnd: sub.trial_end };
  }

  /** The subscription product. Reuses STRIPE_FOUNDING_PRODUCT_ID or creates once.
   *  (Pre-existing internal identifier, kept unchanged — see the interface
   *  doc comment on createFoundingCheckout.) */
  private async ensureFoundingProductId(): Promise<string> {
    if (this.foundingProductId) return this.foundingProductId;
    if (process.env.STRIPE_FOUNDING_PRODUCT_ID) {
      this.foundingProductId = process.env.STRIPE_FOUNDING_PRODUCT_ID;
      return this.foundingProductId;
    }
    const product = await this.stripe.products.create({
      name: "AFRA — Annual Plan",
    });
    this.foundingProductId = product.id;
    return this.foundingProductId;
  }

  async createFoundingCheckout(args: {
    operatorId: string;
    email: string;
    name?: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    // Create the customer up front so we persist its id. Stripe Checkout
    // collects the card on its own page — required up front by default for
    // subscription-mode Checkout, even with a trial (no payment_method_
    // collection override needed; Stripe's default is "always").
    const customer = await this.stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: { operatorId: args.operatorId },
    });

    // A pre-made annual price id wins; else build a recurring price_data line.
    const priceId = process.env.STRIPE_FOUNDING_PRICE_ID;
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ANNUAL_PRICE_CENTS,
            recurring: { interval: "year" },
            product: await this.ensureFoundingProductId(),
          },
        };

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription", // recurring annual, WITH a trial (see subscription_data)
      customer: customer.id,
      line_items: [lineItem],
      subscription_data: {
        trial_period_days: TRIAL_DAYS_BACKSTOP,
        // No card on file by the natural trial end -> cancel cleanly rather
        // than attempting a charge with nothing to charge. In practice this
        // shouldn't fire: Checkout's default payment_method_collection
        // already requires a card before the session can complete.
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        // Also on the subscription itself (not just the Checkout Session
        // below) so the webhook can resolve operatorId directly off
        // customer.subscription.* events even if they arrive before
        // checkout.session.completed has persisted stripeSubscriptionId —
        // Stripe doesn't guarantee webhook delivery order.
        metadata: { operatorId: args.operatorId },
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: args.operatorId,
      // metadata is echoed on the webhook event for operator matching.
      metadata: { operatorId: args.operatorId, plan: "founding_annual" },
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return { checkoutUrl: session.url, sessionId: session.id, customerId: customer.id };
  }

  async getCheckoutSessionAmount(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.amount_total == null || !session.currency) return null;
      // Legitimately 0 during the trial — see the interface doc comment.
      return { amountTotal: session.amount_total, currency: session.currency };
    } catch {
      // Bad/unknown session id (e.g. a stale or tampered query param) — the
      // caller must not treat a null return as an error on a real signup.
      return null;
    }
  }

  async endTrialNow(subscriptionId: string) {
    const sub = await this.stripe.subscriptions.update(subscriptionId, { trial_end: "now" });
    return { stripeStatus: sub.status };
  }
}

// --- Offline fake ------------------------------------------------------------

export class FakeBillingProvider implements BillingProvider {
  readonly mode = "fake" as const;
  private statuses = new Map<string, string>();
  private seq = 0;

  async createCustomer(args: { email: string; name?: string; operatorId: string }) {
    return { customerId: `cus_fake_${args.operatorId}` };
  }

  async createTrialSubscription(args: { customerId: string; quantity?: number }) {
    const subscriptionId = `sub_fake_${args.customerId}_${++this.seq}`;
    this.statuses.set(subscriptionId, "trialing");
    return { subscriptionId, stripeStatus: "trialing" };
  }

  async cancelSubscription(subscriptionId: string) {
    this.statuses.set(subscriptionId, "canceled");
    return { stripeStatus: "canceled" };
  }

  async updateDefaultPaymentMethod() {
    return { ok: true as const };
  }

  async getSubscriptionStatus(subscriptionId: string) {
    return { stripeStatus: this.statuses.get(subscriptionId) ?? "trialing", trialEnd: null };
  }

  /** Test-only: seed a subscription's tracked status directly, for smoke
   *  scripts simulating a Stripe-side change that didn't happen via any other
   *  method on this class (e.g. dunning, or the natural 60-day backstop with
   *  no app-initiated endTrialNow call) — exercises applyStripeStatus's
   *  re-fetch-before-write behavior against a status this fake wouldn't
   *  otherwise know about. Not part of BillingProvider; real Stripe has no
   *  equivalent (you can't just declare a status — see StripeBillingProvider,
   *  which has no matching method). */
  setStatusForTest(subscriptionId: string, status: string): void {
    this.statuses.set(subscriptionId, status);
  }

  async endTrialNow(subscriptionId: string) {
    // No real webhook loop in fake mode, so the fake must self-report the
    // outcome directly rather than relying on an async event to land later.
    this.statuses.set(subscriptionId, "active");
    return { stripeStatus: "active" };
  }

  async createFoundingCheckout(args: {
    operatorId: string;
    email: string;
    name?: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    // Offline: there's no Stripe-hosted page and no webhook. Route to a DEV-ONLY
    // confirm endpoint that stands in for both — it calls the same server-side
    // confirmFoundingPayment() the real webhook calls (it does NOT trust a
    // browser redirect param as proof of payment). Gated to fake mode in the route.
    const sessionId = `cs_fake_${args.operatorId}_${++this.seq}`;
    const customerId = `cus_fake_${args.operatorId}`;
    const subscriptionId = `sub_fake_${args.operatorId}_${this.seq}`;
    this.statuses.set(subscriptionId, "trialing");
    const origin = new URL(args.successUrl).origin;
    const url = new URL(`${origin}/api/dev/founding-checkout`);
    url.searchParams.set("session_id", sessionId);
    url.searchParams.set("operator_id", args.operatorId);
    url.searchParams.set("subscription_id", subscriptionId);
    // Real Stripe substitutes the literal "{CHECKOUT_SESSION_ID}" placeholder
    // in success_url with the real session id before redirecting — this fake
    // stand-in has to do the same substitution itself, or callers relying on
    // that placeholder (see /welcome) get the literal unsubstituted string.
    url.searchParams.set("success", args.successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId));
    url.searchParams.set("cancel", args.cancelUrl);
    return { checkoutUrl: url.toString(), sessionId, customerId };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match BillingProvider
  async getCheckoutSessionAmount(_sessionId: string) {
    // No real Checkout Session object exists in fake mode. Legitimately 0 —
    // the trial charges nothing at signup, same as real Stripe.
    return { amountTotal: 0, currency: "usd" };
  }
}

let cached: BillingProvider | undefined;

/** Returns the real Stripe provider when a test key is present, else the fake. */
export function getBillingProvider(): BillingProvider {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key && key.startsWith("sk_")
    ? new StripeBillingProvider(key)
    : new FakeBillingProvider();
  return cached;
}
