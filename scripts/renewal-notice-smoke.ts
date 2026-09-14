import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { applyStripeStatus, cancelBilling } from "../src/lib/activation";
import { FakeBillingProvider } from "../src/lib/billing";
import { provision } from "../src/lib/provision";

// Proves the annual renewal notice: subscriptionRenewsAt syncs from Stripe
// state (and clears on a scheduled cancel), and /api/jobs/run-scheduled-emails
// sends one notice per renewal date, only inside the 30-day window, never to a
// canceling or trialing operator. Uses the fake billing provider.

process.env.JOBS_ADMIN_SECRET ??= "smoke-test-secret";
const DAY = 24 * 60 * 60 * 1000;
let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function freshOperator(handle: string, data: Record<string, unknown>) {
  await prisma.operator.deleteMany({ where: { email: `${handle}@pending.afra.local` } });
  const { operatorId } = await provision(prisma, { instagramHandle: `@${handle}`, role: { title: "Server" }, calendarChoice: "google" });
  await prisma.operator.update({ where: { id: operatorId }, data: { plan: "founding_annual", ...data } });
  return operatorId;
}

async function runJob() {
  const { POST } = await import("../src/app/api/jobs/run-scheduled-emails/route");
  const res = await POST(new Request("http://localhost/api/jobs/run-scheduled-emails", {
    method: "POST",
    headers: { "x-admin-secret": process.env.JOBS_ADMIN_SECRET! },
  }));
  return (await res.json()) as { ok: boolean; renewalNotice: { eligible: number; sent: number; errors: string[] } };
}

const noticedFor = async (id: string) =>
  (await prisma.operator.findUniqueOrThrow({ where: { id } })).renewalNoticeSentForRenewsAt;

async function main() {
  prisma = await requireDevDatabase();
  const ids: string[] = [];

  console.log("1) subscriptionRenewsAt syncs from Stripe and clears on scheduled cancel:");
  const billing = new FakeBillingProvider();
  const { operatorId: synced } = await provision(
    prisma,
    { instagramHandle: "@renewsync", role: { title: "Server" }, calendarChoice: "google" },
    { billing },
  );
  ids.push(synced);
  await prisma.operator.update({ where: { id: synced }, data: { plan: "founding_annual" } });
  const subId = (await prisma.operator.findUniqueOrThrow({ where: { id: synced } })).stripeSubscriptionId!;
  const periodEnd = Math.floor((Date.now() + 200 * DAY) / 1000);
  billing.setStatusForTest(subId, "active");
  billing.setPeriodEndForTest(subId, periodEnd);
  await applyStripeStatus(prisma, billing, synced);
  let row = await prisma.operator.findUniqueOrThrow({ where: { id: synced } });
  assert(row.subscriptionRenewsAt?.getTime() === periodEnd * 1000, "active subscription -> renewal date = Stripe period end");
  await cancelBilling(prisma, billing, synced);
  row = await prisma.operator.findUniqueOrThrow({ where: { id: synced } });
  assert(row.subscriptionRenewsAt === null && !!row.subscriptionCancelAt, "scheduled cancel clears the renewal date");
  await applyStripeStatus(prisma, billing, synced);
  row = await prisma.operator.findUniqueOrThrow({ where: { id: synced } });
  assert(row.subscriptionRenewsAt === null, "webhook re-sync keeps it cleared while canceling");

  console.log("\n2) Job sends only inside the window, once per renewal:");
  const in20 = new Date(Date.now() + 20 * DAY);
  const due = await freshOperator("renewdue", { billingStatus: "active", subscriptionRenewsAt: in20 });
  const far = await freshOperator("renewfar", { billingStatus: "active", subscriptionRenewsAt: new Date(Date.now() + 40 * DAY) });
  const canceling = await freshOperator("renewcanceling", { billingStatus: "active", subscriptionRenewsAt: in20, subscriptionCancelAt: in20 });
  const trialing = await freshOperator("renewtrialing", { billingStatus: "trialing", subscriptionRenewsAt: in20 });
  ids.push(due, far, canceling, trialing);

  const r1 = await runJob();
  assert(r1.ok, "job ran ok");
  assert((await noticedFor(due))?.getTime() === in20.getTime(), "operator renewing in 20 days was noticed for that date");
  assert((await noticedFor(far)) === null, "operator renewing in 40 days not yet noticed");
  assert((await noticedFor(canceling)) === null, "operator with a scheduled cancel is never noticed");
  assert((await noticedFor(trialing)) === null, "trialing operator is never noticed");

  const r2 = await runJob();
  assert(r2.renewalNotice.errors.every((e) => !e.startsWith(due)), "re-run did not attempt the same operator again");

  console.log("\n3) Next year's renewal gets its own notice:");
  const nextYear = new Date(in20.getTime() + 365 * DAY);
  await prisma.operator.update({ where: { id: due }, data: { subscriptionRenewsAt: nextYear } });
  await runJob();
  assert((await noticedFor(due))?.getTime() === in20.getTime(), "a renewal a year out is not noticed early");
  const nextInWindow = new Date(Date.now() + 25 * DAY);
  await prisma.operator.update({ where: { id: due }, data: { subscriptionRenewsAt: nextInWindow } });
  await runJob();
  assert((await noticedFor(due))?.getTime() === nextInWindow.getTime(), "a new renewal date inside the window is noticed again");

  await prisma.operator.deleteMany({ where: { id: { in: ids } } });
  console.log("\nRenewal notice smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma?.$disconnect());
