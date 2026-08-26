import Stripe from "stripe";
import { applyStripeStatus, confirmFoundingPayment } from "../../../../lib/activation";
import { prisma } from "../../../../lib/prisma";

// Stripe webhook — the dunning / lifecycle trigger. Stripe POSTs subscription
// and invoice events here; we verify the signature, map them to billingStatus
// via applyStripeStatus() (which routes gateBilling through evaluateReadiness),
// and ack. Test the mapping directly in scripts; this route is the prod seam.
//
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in env. Raw body is needed
// for signature verification, so we read request.text() (not json()).

async function operatorIdBySubscription(subscriptionId?: string | null) {
  if (!subscriptionId) return null;
  const op = await prisma.operator.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  return op?.id ?? null;
}

/** operatorId is stamped on the subscription itself at creation time (see
 *  createFoundingCheckout's subscription_data.metadata, billing.ts) — checked
 *  first since Stripe doesn't guarantee delivery order between
 *  checkout.session.completed and customer.subscription.* events, so
 *  stripeSubscriptionId may not be persisted yet when a subscription event
 *  arrives first. */
function operatorIdFromSubscriptionMetadata(sub: Stripe.Subscription): string | null {
  return sub.metadata?.operatorId ?? null;
}

async function operatorIdByCustomer(customerId?: string | null) {
  if (!customerId) return null;
  const op = await prisma.operator.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return op?.id ?? null;
}

async function operatorIdByCheckoutSession(sessionId?: string | null) {
  if (!sessionId) return null;
  const op = await prisma.operator.findFirst({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true },
  });
  return op?.id ?? null;
}

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

export async function POST(request: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", webhookSecret);
  } catch (err) {
    return Response.json(
      { error: `signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      // Checkout completed — for a trial subscription this means the trial
      // has started, not that anything was charged (see docs/CLAIMS.md).
      // session.status === "complete" is Stripe's own recommended,
      // mode-agnostic fulfillment signal — checked instead of
      // payment_status, whose "paid" value for a trial subscription
      // specifically means "the $0 trial invoice was processed," not "a real
      // charge succeeded." Using status here avoids depending on that nuance.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.status === "complete") {
        const operatorId =
          session.metadata?.operatorId ??
          session.client_reference_id ??
          (await operatorIdByCheckoutSession(session.id));
        if (operatorId) {
          await confirmFoundingPayment(prisma, operatorId, {
            customerId: idOf(session.customer),
            subscriptionId: idOf(session.subscription),
            paymentIntentId: idOf(session.payment_intent),
            checkoutSessionId: session.id,
            // Real Stripe's own signal, off the signature-verified event —
            // not inferred from which secret key is configured. Test-mode
            // checkouts (including the founding live-mode E2E test) must
            // never count toward the "first 10 only" seat cap.
            livemode: event.livemode,
          });
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // This is also where a trial's end (candidate cap or the 60-day
      // backstop) gets reconciled — applyStripeStatus handles both causes
      // identically. See its doc comment in activation.ts.
      const sub = event.data.object as Stripe.Subscription;
      const operatorId =
        operatorIdFromSubscriptionMetadata(sub) ?? (await operatorIdBySubscription(sub.id));
      if (operatorId) await applyStripeStatus(prisma, operatorId, sub.status);
      break;
    }
    case "invoice.payment_failed": {
      // Dunning: a failed payment moves the operator to past_due.
      const invoice = event.data.object as Stripe.Invoice;
      const operatorId =
        (await operatorIdByCustomer(
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
        ));
      if (operatorId) await applyStripeStatus(prisma, operatorId, "past_due");
      break;
    }
    default:
      // Ignore unrelated events.
      break;
  }

  return Response.json({ received: true });
}
