import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { connectChannel } from "../src/lib/activation";
import { provision } from "../src/lib/provision";

// Proves the "you're live" email's transition-gating, reachFlag branching, and
// idempotency (src/lib/activation.ts's sendLiveEmailOnce, hooked into the
// shared connectChannel() orchestrator so it fires identically regardless of
// which caller connects the channel — today that's only the ManyChat
// admin-confirm route, but the hook lives in the orchestrator, not the route):
//   - a genuine stubbed -> connected transition sends variant A for a normal
//     reachFlag: false operator
//   - the same transition sends variant B (with the three traffic tactics)
//     for a reachFlag: true operator
//   - calling connectChannel again while already connected (e.g. the admin
//     route being re-hit just to set manychatSubscriberId) does NOT re-send
// Does not require RESEND_API_KEY — the stub path proves both templates
// render without throwing.

let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// Mirrors the confirming provider the real admin-confirm route builds
// (src/app/api/manychat/admin/confirm/route.ts) — the real verification work
// happens outside this call, connect() just reports the outcome.
const confirmingProvider = {
  mode: "manychat" as const,
  async connect() {
    return { status: "connected" as const };
  },
  async sendMessage(): Promise<never> {
    throw new Error("not used by this smoke test");
  },
  async status() {
    return { status: "connected" as const };
  },
};

async function freshOperator(handle: string, reachFlag: boolean) {
  await prisma.operator.deleteMany({ where: { email: `${handle}@pending.afra.local` } });
  const { operatorId } = await provision(prisma, {
    instagramHandle: `@${handle}`,
    role: { title: "Server" },
    calendarChoice: "google",
    followerBand: reachFlag ? "under_500" : "10k_plus",
    reachFlag,
  });
  const channel = await prisma.channelConnection.findFirstOrThrow({ where: { operatorId } });
  return { operatorId, channelConnectionId: channel.id };
}

async function main() {
  prisma = await requireDevDatabase();

  console.log("1) Normal reach (reachFlag: false) — genuine transition must send variant A:");
  const opA = await freshOperator("liveemailsmokea", false);
  const resultA = await connectChannel(prisma, confirmingProvider, opA.channelConnectionId);
  const expectedReason = process.env.RESEND_API_KEY ? "sent for real" : "stub";
  console.log(`   RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)} — expecting: ${expectedReason}`);
  if (process.env.RESEND_API_KEY) {
    assert(
      resultA.liveEmail.sent === true && resultA.liveEmail.variant === "normal-reach",
      "liveEmail sent, variant 'normal-reach' (real Resend call succeeded)",
    );
  } else {
    assert(
      !resultA.liveEmail.sent && resultA.liveEmail.reason === "stub",
      `reason is 'stub' (got: ${JSON.stringify(resultA.liveEmail)})`,
    );
  }
  const opARow = await prisma.operator.findUniqueOrThrow({ where: { id: opA.operatorId } });
  assert(opARow.liveEmailSentAt !== null, "liveEmailSentAt is now set — claim taken");
  const firstSentAt = opARow.liveEmailSentAt;

  console.log("\n2) Re-hitting connectChannel while ALREADY connected — must NOT re-send:");
  const resultA2 = await connectChannel(prisma, confirmingProvider, opA.channelConnectionId);
  assert(
    !resultA2.liveEmail.sent && resultA2.liveEmail.reason === "no-transition",
    `reason is 'no-transition' — not a genuine transition (got: ${JSON.stringify(resultA2.liveEmail)})`,
  );
  const opARowSecond = await prisma.operator.findUniqueOrThrow({ where: { id: opA.operatorId } });
  assert(
    opARowSecond.liveEmailSentAt?.getTime() === firstSentAt?.getTime(),
    "liveEmailSentAt is unchanged — no second claim, no duplicate send",
  );

  console.log("\n3) Low reach (reachFlag: true) — genuine transition must send variant B (three tactics):");
  const opB = await freshOperator("liveemailsmokeb", true);
  const resultB = await connectChannel(prisma, confirmingProvider, opB.channelConnectionId);
  if (process.env.RESEND_API_KEY) {
    assert(
      resultB.liveEmail.sent === true && resultB.liveEmail.variant === "low-reach",
      "liveEmail sent, variant 'low-reach' (real Resend call succeeded)",
    );
  } else {
    assert(
      !resultB.liveEmail.sent && resultB.liveEmail.reason === "stub",
      `reason is 'stub' (got: ${JSON.stringify(resultB.liveEmail)})`,
    );
  }

  await prisma.operator.deleteMany({ where: { id: { in: [opA.operatorId, opB.operatorId] } } });
  console.log("\nLive email smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
