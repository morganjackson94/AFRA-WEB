import { describeReadiness, type GateState } from "../src/lib/dashboard";

// Step 4 proof: the copy SSOT never blurs "ready" into "live". Pure-function
// test (no DB) on the exact logic the dashboard renders.

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const LIVE_WORDS = /\b(live|accepting applicants)\b/i;

// A freshly-provisioned, trialing instance: template + billing met, channel +
// calendar stubbed => readinessState "ready".
const readyRole: GateState = {
  readinessState: "ready",
  gatePlatform: false,
  gateCalendar: false,
  gateTemplate: true,
  gateBilling: true,
};

// All four gates true => "live".
const liveRole: GateState = {
  readinessState: "live",
  gatePlatform: true,
  gateCalendar: true,
  gateTemplate: true,
  gateBilling: true,
};

// Setup not configured yet.
const pendingRole: GateState = {
  readinessState: "pending",
  gatePlatform: false,
  gateCalendar: false,
  gateTemplate: false,
  gateBilling: false,
};

function main() {
  console.log("READY instance (stubbed channel/calendar):");
  const ready = describeReadiness(readyRole);
  console.log(`  headline="${ready.headline}" tone=${ready.tone} accepting=${ready.acceptingApplicants}`);
  console.log(`  pending=${ready.pending.map((p) => p.cta).join(", ")}`);
  assert(ready.tone === "setup", "ready tone is 'setup', not 'live'");
  assert(ready.acceptingApplicants === false, "ready does NOT accept applicants");
  assert(!LIVE_WORDS.test(ready.headline), "ready HEADLINE never claims 'live'/'accepting applicants'");
  assert(/finishing setup/i.test(ready.headline), "ready headline says 'finishing setup'");
  // The subtext may mention these words, but only to NEGATE them ("not accepting
  // applicants yet") — assert it explicitly states the non-live status.
  assert(/not accepting applicants/i.test(ready.subtext), "ready subtext explicitly says NOT accepting applicants yet");
  assert(
    ready.pending.some((p) => p.cta === "Connect Instagram") &&
      ready.pending.some((p) => p.cta === "Connect calendar"),
    "ready lists the pending channel + calendar connections",
  );

  console.log("\nLIVE instance (all gates true):");
  const live = describeReadiness(liveRole);
  console.log(`  headline="${live.headline}" tone=${live.tone} accepting=${live.acceptingApplicants}`);
  assert(live.tone === "live", "live tone is 'live'");
  assert(live.acceptingApplicants === true, "live IS accepting applicants");
  assert(/you're live/i.test(live.headline), "live headline says \"You're live\"");
  assert(live.pending.length === 0, "live has nothing pending");

  console.log("\nPENDING instance (not configured):");
  const pending = describeReadiness(pendingRole);
  assert(pending.tone === "setup" && !LIVE_WORDS.test(pending.headline), "pending is setup, not live");
  assert(/finish setup/i.test(pending.headline), "pending headline says 'Finish setup'");

  console.log("\nDashboard copy smoke test PASSED.");
}

main();
