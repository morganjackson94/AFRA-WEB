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
      // Founding annual: the ONLY trustworthy "paid" signal (verified off the
      // raw body above). Only confirm when Stripe reports the payment as paid.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const operatorId =
          session.metadata?.operatorId ??
          session.client_reference_id ??
          (await operatorIdByCheckoutSession(session.id));
        if (operatorId) {
          await confirmFoundingPayment(prisma, operatorId, {
            customerId: idOf(session.customer),
            paymentIntentId: idOf(session.payment_intent),
            checkoutSessionId: session.id,
          });
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const operatorId = await operatorIdBySubscription(sub.id);
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
