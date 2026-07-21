import Stripe from "stripe";

// Billing provider boundary. Real Stripe (test mode) when STRIPE_SECRET_KEY is
// set; otherwise a deterministic in-memory fake so the system is fully runnable
// and testable offline. Same swap-the-stub discipline as the channel/calendar.

export const PRICE_PER_LOCATION_CENTS = 19900; // $199/mo per location (monthly path)
export const TRIAL_DAYS = 14; // 2-week free trial (monthly path only)
export const FOUNDING_PRICE_CENTS = 199000; // $1,990 one-time, first year (founding path)
export const FOUNDING_RENEWAL_PRICE_CENTS = 478800; // $4,788/yr then-current price after the founding year (see docs/CLAIMS.md)
// Founding operators' standing discount off then-current pricing (25% —
// decided against a 50%-forever discount specifically to avoid recreating the
// grandfather-clause trap: a flat percentage compounds if AFRA's price rises
// later, e.g. at $10K then-current, 50% off is $5K forever). Conditional on
// continuous subscription — cancel-and-return does not retain founding
// pricing. See content/legal/terms.md §7(a).
export const FOUNDING_RENEWAL_DISCOUNT_RATE = 0.25;
export const FOUNDING_OPERATOR_RENEWAL_PRICE_CENTS = Math.round(
  FOUNDING_RENEWAL_PRICE_CENTS * (1 - FOUNDING_RENEWAL_DISCOUNT_RATE),
); // $3,591/yr — what a continuous founding operator actually pays at renewal
// Cohort cap — see countActiveFoundingOperators() in activation.ts, which
// enforces this against real billingStatus="active" data (src/app/onboarding/
// actions.ts blocks checkout once it's reached; src/app/page.tsx's scarcity
// counter reads the same count). Single source of truth for the number "10."
export const FOUNDING_SPOTS_TOTAL = 10;

// TODO(billing): Founding purchase is a ONE-TIME charge. Renewal at the
// then-current price ($4,788/yr as of docs/CLAIMS.md) minus the founding
// operator's 25% standing discount ($3,591/yr), conditional on continuous
// subscription, is promised but NOT automated. Build either (a) an annual
// Stripe subscription, or (b) a renewal reminder + invoice flow, before the
// first cohort's year ends.

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
  getSubscriptionStatus(subscriptionId: string): Promise<{ stripeStatus: string }>;

  /**
   * Create a Stripe-HOSTED Checkout Session for the one-time $1,990 founding
   * charge. The operator enters their card on Stripe's page — our code never
   * sees raw card data. Returns the hosted URL to redirect to, plus the session
   * + customer ids we persist for webhook matching. mode = "payment" (one-time),
   * NOT a subscription, NOT a trial.
   */
  createFoundingCheckout(args: {
    operatorId: string;
    email: string;
    name?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string; sessionId: string; customerId: string }>;

  /**
   * Read-only lookup of what a completed Checkout Session actually charged,
   * for the Purchase pixel event on /welcome (real amount over a hardcoded
   * constant — avoids drift if founding pricing ever changes). Returns null
   * if the session can't be found/read; callers fall back to
   * FOUNDING_PRICE_CENTS in that case. Never mutates anything.
   */
  getCheckoutSessionAmount(sessionId: string): Promise<{ amountTotal: number; currency: string } | null>;
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
    return { stripeStatus: sub.status };
  }

  /** The founding annual product. Reuses STRIPE_FOUNDING_PRODUCT_ID or creates once. */
  private async ensureFoundingProductId(): Promise<string> {
    if (this.foundingProductId) return this.foundingProductId;
    if (process.env.STRIPE_FOUNDING_PRODUCT_ID) {
      this.foundingProductId = process.env.STRIPE_FOUNDING_PRODUCT_ID;
      return this.foundingProductId;
    }
    const product = await this.stripe.products.create({
      name: "AFRA — Founding Operator (first year)",
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
    // Create the customer up front so we persist its id (the one-time payment
    // makes no subscription). Stripe Checkout collects the card on its own page.
    const customer = await this.stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: { operatorId: args.operatorId },
    });

    // A pre-made annual price id wins; else build a one-time price_data line.
    const priceId = process.env.STRIPE_FOUNDING_PRICE_ID;
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: FOUNDING_PRICE_CENTS,
            product: await this.ensureFoundingProductId(),
          },
        };

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment", // one-time charge, NOT a subscription, NO trial
      customer: customer.id,
      line_items: [lineItem],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: args.operatorId,
      // metadata is echoed on the webhook event for operator matching.
      metadata: { operatorId: args.operatorId, plan: "founding_annual" },
      payment_intent_data: { metadata: { operatorId: args.operatorId } },
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return { checkoutUrl: session.url, sessionId: session.id, customerId: customer.id };
  }

  async getCheckoutSessionAmount(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.amount_total == null || !session.currency) return null;
      return { amountTotal: session.amount_total, currency: session.currency };
    } catch {
      // Bad/unknown session id (e.g. a stale or tampered query param) — the
      // caller falls back to the known founding price rather than erroring
      // the page a real paying operator just landed on.
      return null;
    }
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
    return { stripeStatus: this.statuses.get(subscriptionId) ?? "trialing" };
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
    const origin = new URL(args.successUrl).origin;
    const url = new URL(`${origin}/api/dev/founding-checkout`);
    url.searchParams.set("session_id", sessionId);
    url.searchParams.set("operator_id", args.operatorId);
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
    // No real Checkout Session object exists in fake mode — the dev stand-in
    // always charges the same founding price, so that's the honest answer.
    return { amountTotal: FOUNDING_PRICE_CENTS, currency: "usd" };
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
