import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { connectChannel } from "../src/lib/activation";
import { getCalendarProvider } from "../src/lib/calendar";
import { getChannelProvider, StubChannelProvider } from "../src/lib/channel";
import { getNudgeScheduler } from "../src/lib/nudge";
import { provision } from "../src/lib/provision";

// Verifies the B1/B2/A5 stub seams: methods exist and return stub data, and the
// stub connect() stays HONEST (does not fake a connected channel / live instance).

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const channel = getChannelProvider(prisma);
  const calendar = getCalendarProvider(prisma);
  const nudge = getNudgeScheduler();

  console.log("Provider modes (default = stub):");
  assert(channel.mode === "stub", "channel provider defaults to stub");
  assert(calendar.mode === "stub", "calendar provider defaults to stub");
  assert(nudge.mode === "stub", "nudge scheduler defaults to stub");

  const email = "integrations@smoke.test";
  await prisma.operator.deleteMany({ where: { email } });
  const { operatorId } = await provision(
    prisma,
    { instagramHandle: "@integrationsmoke", role: { title: "Server", pay: "$18/hr" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false },
  );
  const op = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: { channelConnections: true, locations: { include: { calendarConnections: true, roles: true } } },
  });
  const channelConn = op.channelConnections[0];
  const calConn = op.locations[0].calendarConnections[0];
  const location = op.locations[0];

  console.log("\nB1 channel stub:");
  const send = await channel.sendMessage({
    channelConnectionId: channelConn.id,
    recipient: "candidate_123",
    text: "Thanks for applying! A couple quick questions…",
    messageTag: "HUMAN_AGENT",
  });
  assert(send.stub === true && send.delivered === false, "sendMessage() logs intent, delivers nothing (stub)");
  const st = await channel.status({ channelConnectionId: channelConn.id });
  assert(st.status === "stubbed", "status() reports 'stubbed'");

  console.log("\n  HONEST connect — stub must NOT flip the gate:");
  const before = (await prisma.role.findFirstOrThrow({ where: { id: op.locations[0].roles[0].id } }));
  const conn = await connectChannel(prisma, channel, channelConn.id);
  const after = (await prisma.role.findFirstOrThrow({ where: { id: op.locations[0].roles[0].id } }));
  const connDb = await prisma.channelConnection.findUniqueOrThrow({ where: { id: channelConn.id } });
  assert(conn.status === "stubbed", "stub connect() returns 'stubbed'");
  assert(connDb.status === "stubbed", "connection stays 'stubbed' in DB (not faked connected)");
  assert(after.gatePlatform === false, "platform gate stays FALSE after stub connect");
  assert(after.readinessState !== "live" && before.readinessState !== "live", "instance never reads live via the stub");
  assert(conn.recompute.wentLiveFired === false, "WentLive does NOT fire from a stub connect");

  console.log("\nB2 calendar stub:");
  const avail = await calendar.getAvailability({
    locationId: location.id,
    fromISO: "2026-07-01T00:00:00Z",
    toISO: "2026-07-02T00:00:00Z",
  });
  assert(avail.stub === true && avail.slots.length === 0, "getAvailability() returns no real availability (stub)");
  const book = await calendar.book({
    locationId: location.id,
    candidateId: "candidate_123",
    slot: { startISO: "2026-07-01T15:00:00Z", endISO: "2026-07-01T15:30:00Z" },
  });
  assert(book.status === "stubbed" && book.stub === true, "book() logs intent, creates nothing (stub)");
  const calSt = await calendar.status({ calendarConnectionId: calConn.id });
  assert(calSt.status === "stubbed", "calendar status() reports 'stubbed'");

  console.log("\nA5 nudge stub:");
  const scheduled = await nudge.scheduleNudge({
    candidateId: "candidate_123",
    kind: "interview_reminder",
    sendAtISO: "2026-07-01T13:00:00Z",
    withinMessagingWindow: true,
    messageTag: "CONFIRMED_EVENT_UPDATE",
  });
  assert(scheduled.scheduled === true && scheduled.stub === true, "scheduleNudge() logs intent (stub), nothing sent");

  console.log("\nReal branches are explicitly unbuilt (the seam is honest about TODO):");
  process.env.CHANNEL_PROVIDER = "meta";
  let threw = false;
  try {
    await getChannelProvider(prisma).sendMessage({ channelConnectionId: channelConn.id, recipient: "x", text: "y" });
  } catch {
    threw = true;
  }
  delete process.env.CHANNEL_PROVIDER;
  assert(threw, "selecting the real Meta branch throws 'not implemented' (B1 pending)");
  assert(channel instanceof StubChannelProvider, "the default in-session provider is the stub");

  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nIntegrations stub-seam smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
