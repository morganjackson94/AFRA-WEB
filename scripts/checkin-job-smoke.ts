import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { provision } from "../src/lib/provision";

// Proves POST/GET /api/jobs/run-scheduled-emails: sends the day-20 check-in
// exactly once per eligible operator, skips refunded/canceled operators
// (billingStatus != "active") and not-yet-due operators, and is safe to
// re-run (a second run against the same due operator sends nothing new).
// Calls the route handler functions directly (no running server needed) —
// same "import the route module" approach as any other Next.js route-handler
// smoke test in this repo. Requires JOBS_ADMIN_SECRET to be set (any value)
// so the route doesn't 503.

process.env.JOBS_ADMIN_SECRET ??= "smoke-test-secret";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function freshOperator(handle: string, opts: { dueAt: Date | null; billingStatus: string }) {
  await prisma.operator.deleteMany({ where: { email: `${handle}@pending.afra.local` } });
  const { operatorId } = await provision(prisma, {
    instagramHandle: `@${handle}`,
    role: { title: "Server" },
    calendarChoice: "google",
  });
  await prisma.operator.update({
    where: { id: operatorId },
    data: { billingStatus: opts.billingStatus, checkinEmailDueAt: opts.dueAt },
  });
  return operatorId;
}

async function runJob() {
  const { POST } = await import("../src/app/api/jobs/run-scheduled-emails/route");
  const request = new Request("http://localhost:3000/api/jobs/run-scheduled-emails", {
    method: "POST",
    headers: { "x-admin-secret": process.env.JOBS_ADMIN_SECRET! },
  });
  const response = await POST(request);
  return response.json() as Promise<{ ok: boolean; eligible: number; sent: number; skipped: number; errors: string[] }>;
}

async function main() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  console.log("Seeding: one due+active (eligible), one refunded (must be skipped), one not-yet-due (must be skipped):");
  const opDue = await freshOperator("checkinsmokedue", { dueAt: yesterday, billingStatus: "active" });
  const opRefunded = await freshOperator("checkinsmokerefunded", { dueAt: yesterday, billingStatus: "canceled" });
  const opNotYetDue = await freshOperator("checkinsmokenotyetdue", { dueAt: inTenDays, billingStatus: "active" });

  console.log("\n1) Wrong secret — must be rejected, nothing sent:");
  const { POST } = await import("../src/app/api/jobs/run-scheduled-emails/route");
  const badRequest = new Request("http://localhost:3000/api/jobs/run-scheduled-emails", {
    method: "POST",
    headers: { "x-admin-secret": "wrong" },
  });
  const badResponse = await POST(badRequest);
  assert(badResponse.status === 401, `wrong secret is rejected with 401 (got ${badResponse.status})`);

  console.log("\n2) First run — must send exactly to the due+active operator:");
  const result1 = await runJob();
  console.log(`   RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)}`);
  assert(result1.ok === true, "job ran ok");
  assert(result1.eligible === 1, `eligible count is 1 (got ${result1.eligible})`);
  if (process.env.RESEND_API_KEY) {
    assert(result1.sent === 1, `sent count is 1 (got ${result1.sent})`);
  } else {
    // Stub path: sendCheckinEmail resolves { sent: false, stub: true }, which
    // the route records as an error entry, not a `sent` increment — proves
    // the route still renders/attempts the send without throwing.
    assert(result1.sent === 0 && result1.errors.length === 1, `stub path recorded as a non-throwing attempt (got sent=${result1.sent}, errors=${JSON.stringify(result1.errors)})`);
  }

  const dueRow = await prisma.operator.findUniqueOrThrow({ where: { id: opDue } });
  assert(dueRow.checkinEmailSentAt !== null, "checkinEmailSentAt is now set on the due operator");
  const refundedRow = await prisma.operator.findUniqueOrThrow({ where: { id: opRefunded } });
  assert(refundedRow.checkinEmailSentAt === null, "refunded operator was never touched");
  const notYetDueRow = await prisma.operator.findUniqueOrThrow({ where: { id: opNotYetDue } });
  assert(notYetDueRow.checkinEmailSentAt === null, "not-yet-due operator was never touched");

  console.log("\n3) Second run — must be a safe no-op (already sent, nothing newly eligible):");
  const result2 = await runJob();
  assert(result2.eligible === 0, `no eligible operators left (got ${result2.eligible})`);
  assert(result2.sent === 0, "sent nothing on the re-run");

  await prisma.operator.deleteMany({ where: { id: { in: [opDue, opRefunded, opNotYetDue] } } });
  console.log("\nCheck-in job smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
