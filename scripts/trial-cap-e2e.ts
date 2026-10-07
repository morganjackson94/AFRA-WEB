import Stripe from "stripe";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { applyStripeStatus, scheduleTrialEndForCandidateCap } from "../src/lib/activation";
import { FREE_CANDIDATE_CAP, getBillingProvider, TRIAL_CAP_WARNING_AT, TRIAL_DAYS_BACKSTOP } from "../src/lib/billing";
import { ingestScreeningResult } from "../src/lib/manychat";
import { provision } from "../src/lib/provision";

// End-to-end proof of the candidate-cap trial end against REAL Stripe test
// mode, on a test clock: drive an operator to TRIAL_CAP_WARNING_AT, then
// FREE_CANDIDATE_CAP screened candidates through the real ingest path, and
// confirm (a) each email sends once, (b) trial_end moves to cap + 72h, and
// (c) the $4,788 charge happens at that trial_end, not before.
//
// Not a smoke: needs a test-mode STRIPE_SECRET_KEY (refuses anything else)
// and, to actually send, RESEND_API_KEY. Emails go to Resend's
// delivered@resend.dev sink. The test clock (and with it the customer and
// subscription) is deleted at the end; so is the dev operator.
//
//   set -a; source .env.local; set +a; npm run trial-cap:e2e

let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}
const iso = (unix: number | null | undefined) => (unix == null ? "null" : new Date(unix * 1000).toISOString());

// Record every Resend send (subject, when, message id) without changing it.
const sends: { subject: string; at: string; status: number; id?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  if (String(input).startsWith("https://api.resend.com/emails")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const json = await res.clone().json().catch(() => ({}));
    sends.push({ subject: body.subject, at: new Date().toISOString(), status: res.status, id: json.id });
  }
  return res;
};
// Without RESEND_API_KEY, mail.ts logs "[mail:STUB] would send "<subject>""
// instead — count those too, so "sent once" is checked either way.
const realLog = console.log;
console.log = (...args: unknown[]) => {
  const m = typeof args[0] === "string" ? args[0].match(/^\[mail:STUB\] would send "([^"]+)"/) : null;
  if (m) {
    sends.push({ subject: m[1], at: new Date().toISOString(), status: 0, id: "stub" });
    return realLog(`[mail:STUB] "${m[1]}"`);
  }
  realLog(...args);
};
const sentWith = (needle: string) => sends.filter((s) => s.subject.includes(needle) && s.status < 300);

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Refusing to run: STRIPE_SECRET_KEY must be a test-mode key (sk_test_...)");
  prisma = await requireDevDatabase();
  const stripe = new Stripe(key);
  const billing = getBillingProvider();
  if (billing.mode !== "stripe") throw new Error("billing provider is not Stripe");
  console.log(`RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)}`);

  const tag = Date.now();
  const email = `delivered+afra-trialcap-${tag}@resend.dev`;
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: `afra trial-cap e2e ${tag}` });
  let operatorId: string | undefined;

  const advance = async (to: number) => {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: to });
    for (let i = 0; i < 120; i++) {
      const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (c.status === "ready") return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("test clock did not reach ready");
  };

  try {
    console.log(`Test clock ${clock.id}, frozen at ${iso(clock.frozen_time)}`);

    // Customer + annual subscription with the real 60-day trial, the same
    // shape createFoundingCheckout produces (minus the hosted page).
    const customer = await stripe.customers.create({ email, test_clock: clock.id, payment_method: "pm_card_visa" });
    const pm = (await stripe.customers.listPaymentMethods(customer.id)).data[0];
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const priceId = process.env.STRIPE_FOUNDING_PRICE_ID || undefined;
    const product = priceId ? undefined : (process.env.STRIPE_FOUNDING_PRODUCT_ID || (await stripe.products.create({ name: "AFRA trial-cap e2e" })).id);
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [priceId ? { price: priceId } : { price_data: { currency: "usd", unit_amount: 478800, recurring: { interval: "year" }, product: product! } }],
      trial_period_days: TRIAL_DAYS_BACKSTOP,
      metadata: { plan: "founding_annual", e2e: "trial-cap" },
    });
    console.log(`Subscription ${sub.id}: status=${sub.status}, trial_end=${iso(sub.trial_end)} (60-day backstop)`);

    const { operator } = await provision(
      prisma,
      { instagramHandle: `@trialcape2e${tag}`, role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email },
      { startTrial: false },
    );
    operatorId = operator.id;
    await prisma.operator.update({
      where: { id: operator.id },
      data: { plan: "founding_annual", billingStatus: "trialing", stripeCustomerId: customer.id, stripeSubscriptionId: sub.id },
    });
    await stripe.subscriptions.update(sub.id, { metadata: { operatorId: operator.id } });
    const locationId = operator.locations[0].id;
    const ingest = async (i: number) => {
      const r = await ingestScreeningResult(prisma, { locationId, contact: `@e2ecandidate${i}`, outcome: "passed" });
      if (!r.ok) throw new Error(`ingest ${i} failed: ${r.error}`);
    };
    const load = () => prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });

    console.log(`\n1) Drive to ${TRIAL_CAP_WARNING_AT} screened candidates:`);
    for (let i = 1; i <= TRIAL_CAP_WARNING_AT; i++) await ingest(i);
    await ingest(TRIAL_CAP_WARNING_AT); // ManyChat redelivery of the 15th
    let op = await load();
    assert(op.screenedCandidateCount === TRIAL_CAP_WARNING_AT, `count is ${TRIAL_CAP_WARNING_AT} (redelivery not double-counted)`);
    assert(op.trialCapWarningEmailSentAt !== null, `heads-up claimed at ${op.trialCapWarningEmailSentAt?.toISOString()}`);
    assert(sentWith(`of your ${FREE_CANDIDATE_CAP} trial candidates`).length === 1, "heads-up email sent exactly once");

    console.log(`\n2) Drive to ${FREE_CANDIDATE_CAP}:`);
    for (let i = TRIAL_CAP_WARNING_AT + 1; i <= FREE_CANDIDATE_CAP; i++) await ingest(i);
    await ingest(FREE_CANDIDATE_CAP); // redelivery of the 20th
    await scheduleTrialEndForCandidateCap(prisma, billing, operator.id); // the reconcile job's retry
    op = await load();
    const live = await stripe.subscriptions.retrieve(sub.id);
    const reachedAt = Math.floor(op.trialCapReachedAt!.getTime() / 1000);
    console.log(`   20th candidate at ${op.trialCapReachedAt!.toISOString()}; Stripe trial_end now ${iso(live.trial_end)}`);
    assert(live.status === "trialing", "subscription still trialing");
    assert(live.trial_end === reachedAt + 72 * 3600, "Stripe trial_end = 20th candidate + 72h exactly");
    assert(op.trialEndsAt?.getTime() === live.trial_end! * 1000, "Operator.trialEndsAt matches Stripe");
    assert(op.trialEndNoticeEmailSentAt !== null, `trial-end notice claimed at ${op.trialEndNoticeEmailSentAt?.toISOString()}`);
    assert(sentWith("Your trial ends in").length === 1, "trial-end notice sent exactly once despite redelivery + reconcile retry");
    assert(sentWith(`of your ${FREE_CANDIDATE_CAP} trial candidates`).length === 1, "heads-up still sent only once");
    const trialEnd = live.trial_end!;

    const paidAnnual = async () =>
      (await stripe.invoices.list({ subscription: sub.id, limit: 20 })).data.filter((inv) => inv.amount_paid >= 478800);

    console.log(`\n3) Advance the clock to 1 minute before trial_end (${iso(trialEnd - 60)}):`);
    await advance(trialEnd - 60);
    const before = await stripe.subscriptions.retrieve(sub.id);
    assert(before.status === "trialing", "still trialing one minute before trial_end");
    assert((await paidAnnual()).length === 0, "no $4,788 charge before trial_end");

    console.log(`\n4) Advance past trial_end, through Stripe's ~1h draft-invoice window (${iso(trialEnd + 2 * 3600)}):`);
    await advance(trialEnd + 2 * 3600);
    const after = await stripe.subscriptions.retrieve(sub.id);
    const invoices = await paidAnnual();
    assert(after.status === "active", "subscription active after trial_end");
    assert(invoices.length === 1, "exactly one $4,788 invoice paid");
    const inv = invoices[0];
    const payments = await stripe.invoicePayments.list({ invoice: inv.id, limit: 1 });
    const pi = payments.data[0]?.payment.payment_intent;
    const piId = typeof pi === "string" ? pi : pi?.id;
    const charge = piId ? (await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] })).latest_charge : null;
    const chargeCreated = charge && typeof charge !== "string" ? charge.created : null;
    console.log(`   invoice ${inv.id}: created ${iso(inv.created)}, finalized ${iso(inv.status_transitions.finalized_at)}, paid ${iso(inv.status_transitions.paid_at)}, amount_paid ${inv.amount_paid}`);
    console.log(`   charge created ${iso(chargeCreated)}`);
    assert(inv.created >= trialEnd, "invoice created at/after trial_end, not before");
    assert(inv.status_transitions.paid_at! >= trialEnd, "payment at/after trial_end, not before");

    console.log("\n5) The webhook path closes the loop (applyStripeStatus, as the webhook route calls it):");
    const reconcile = await applyStripeStatus(prisma, billing, operator.id);
    op = await load();
    assert(op.billingStatus === "active" && op.trialEndedAt !== null, "billingStatus active, trialEndedAt stamped");
    console.log(`   trial-ended email: ${JSON.stringify(reconcile.trialEndedEmail)}`);

    console.log("\nResend sends:");
    for (const s of sends) console.log(`   ${s.at}  ${s.status}  ${s.id ?? "-"}  "${s.subject}"`);
    console.log("\nTrial-cap e2e PASSED.");
  } finally {
    if (operatorId) await prisma.operator.delete({ where: { id: operatorId } }).catch(() => {});
    await stripe.testHelpers.testClocks.del(clock.id).catch((e) => console.error("clock cleanup failed:", e.message));
  }
}

main()
  .catch((e) => {
    console.error("\n" + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  })
  .finally(async () => prisma?.$disconnect());
