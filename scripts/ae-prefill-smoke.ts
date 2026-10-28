import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import {
  aeCookieValue,
  checkoutTargetForEmail,
  CODE_ALPHABET,
  createPrefill,
  findAeByPassphrase,
  generatePrefillCode,
  hashPrefillCode,
  loadPrefillDraft,
  normalizePrefillCode,
  parseAeAccounts,
  PREFILL_TTL_MS,
  RATE_LIMIT_MAX_FAILURES,
  resolvePrefillCode,
  verifyAeCookie,
  type AePrefillInput,
} from "../src/lib/aePrefill";
import { provision } from "../src/lib/provision";

// AE pre-filled setup link (src/lib/aePrefill.ts): code format, AE sign-in,
// the draft the AE creates, every way a code must stop working, the per-IP
// lockout, and the checkout-retry fix (an operator who backed out of Stripe
// can try again instead of hitting Operator.email's unique constraint).

let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const EMAIL = "prefill@smoke.test";
const OTHER_EMAIL = "prefill-paid@smoke.test";

const base: AePrefillInput = {
  email: "  Prefill@Smoke.Test ",
  locationsBucket: "3-5",
  primaryState: "TX",
  hasNycLocation: false,
  roles: ["Front of House", "Line Cook", "Dishwasher"],
  pay: "$16–18 / hr",
  disqualifiers: ["no_weekends", "not_a_real_slug"],
  handle: "@prefillsmoke",
  followerBand: "500_2k",
  hiringFrequency: "constantly",
  calendarChoice: "google",
  bookingLinkUrl: "",
};

async function cleanup() {
  await prisma.operator.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  await prisma.onboardingDraft.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  await prisma.prefillAttempt.deleteMany({});
}

async function main() {
  prisma = await requireDevDatabase();
  await cleanup();

  console.log("Code format:");
  const codes = Array.from({ length: 200 }, generatePrefillCode);
  assert(codes.every((c) => c.length === 6 && [...c].every((ch) => CODE_ALPHABET.includes(ch))), "codes are 6 chars from the phone-safe alphabet");
  assert(!/[0O1IL]/.test(codes.join("")), "no 0, O, 1, I or L ever appears");
  assert(normalizePrefillCode("k7p-2qd") === "K7P2QD", "typed code is uppercased and dashes stripped");
  assert(normalizePrefillCode("K7P2Q0") === null, "a code with a look-alike character is rejected");

  console.log("AE sign-in:");
  const accounts = parseAeAccounts('{"david":"correct-horse-battery","Bad Id":"x"}');
  assert(Object.keys(accounts).join() === "david", "only well-formed AE ids with 8+ char passphrases are accepted");
  assert(findAeByPassphrase("correct-horse-battery", accounts) === "david", "the right passphrase finds the AE");
  assert(findAeByPassphrase("wrong", accounts) === null, "a wrong passphrase finds no one");
  const cookie = aeCookieValue("david", accounts)!;
  assert(verifyAeCookie(cookie, accounts) === "david", "a signed AE cookie verifies");
  assert(verifyAeCookie(cookie.replace(/.$/, "x"), accounts) === null, "a tampered AE cookie is refused");
  assert(verifyAeCookie(cookie, parseAeAccounts('{"david":"rotated-passphrase-1"}')) === null, "rotating the passphrase signs the AE out");

  console.log("Creating a prefill:");
  const restricted = await createPrefill(prisma, "david", { ...base, primaryState: "IL" });
  assert(!restricted.ok, "a restricted state (IL) is refused before any code exists");
  const nyc = await createPrefill(prisma, "david", { ...base, primaryState: "NY", hasNycLocation: true });
  assert(!nyc.ok, "a New York City location is refused");
  const noRole = await createPrefill(prisma, "david", { ...base, roles: [] });
  assert(!noRole.ok, "no roles is refused");

  const first = await createPrefill(prisma, "david", base);
  assert(first.ok, "valid answers create a code");
  if (!first.ok) return;
  assert(first.email === EMAIL, "email is normalized");
  const draft = await prisma.onboardingDraft.findUniqueOrThrow({ where: { email: EMAIL } });
  const a = draft.answers as Record<string, unknown>;
  assert(draft.prefillCodeHash === hashPrefillCode(first.code), "only the code's hash is stored");
  assert(draft.aeRef === "david" && draft.step === 7, "draft records the AE and opens at the last step");
  assert(JSON.stringify(a.roles) === JSON.stringify(["Front of House", "Line Cook", "__other__"]), "roles are in the wizard's shape (Other as the sentinel)");
  assert(a.otherRoleText === "Dishwasher", "the free-text role is carried as otherRoleText");
  assert(JSON.stringify(a.disqualifiers) === JSON.stringify(["no_weekends"]), "unknown deal-breaker slugs are dropped");
  assert(a.tosAccepted === false, "terms are never pre-accepted for the operator");

  console.log("Opening a code:");
  const loaded = await loadPrefillDraft(prisma, first.code.toLowerCase());
  assert(loaded?.email === EMAIL && loaded.aeRef === "david", "the code opens its draft (case-insensitive)");
  const resolved = await resolvePrefillCode(prisma, first.code, "203.0.113.5");
  assert(resolved.ok, "resolvePrefillCode accepts a valid code");
  const opened = await prisma.onboardingDraft.findUniqueOrThrow({ where: { email: EMAIL } });
  assert(opened.prefillOpenedAt !== null, "first open is recorded for the AE's follow-up");

  const expiredAt = new Date(Date.now() + PREFILL_TTL_MS + 60_000);
  assert((await loadPrefillDraft(prisma, first.code, expiredAt)) === null, "the code stops working after 72 hours");

  const second = await createPrefill(prisma, "david", base);
  assert(second.ok, "a second code for the same email can be made");
  if (!second.ok) return;
  assert((await loadPrefillDraft(prisma, first.code)) === null, "the newer code replaces the older one");
  assert((await loadPrefillDraft(prisma, second.code)) !== null, "the newer code works");

  console.log("Rate limit:");
  for (let i = 0; i < RATE_LIMIT_MAX_FAILURES; i++) await resolvePrefillCode(prisma, "ZZZZZZ", "198.51.100.9");
  const locked = await resolvePrefillCode(prisma, second.code, "198.51.100.9");
  assert(!locked.ok && locked.reason === "locked", `after ${RATE_LIMIT_MAX_FAILURES} failures that IP is locked out, even with a good code`);
  const otherIp = await resolvePrefillCode(prisma, second.code, "203.0.113.77");
  assert(otherIp.ok, "other IPs are unaffected");

  console.log("Checkout retry and paid customers:");
  assert((await checkoutTargetForEmail(prisma, EMAIL)).kind === "new", "no operator yet → provision a new one");
  const { operatorId } = await provision(prisma, {
    instagramHandle: "@prefillsmoke",
    role: { title: "Front of House" },
    calendarChoice: "google",
    operatorEmail: EMAIL,
  }, { startTrial: false });
  const unpaid = await checkoutTargetForEmail(prisma, " PREFILL@smoke.test");
  assert(unpaid.kind === "unpaid" && unpaid.operatorId === operatorId, "backed out of Stripe → reuse the unpaid operator (no duplicate)");
  assert((await loadPrefillDraft(prisma, second.code)) !== null, "the code still works while unpaid (so they can come back from Stripe)");

  await prisma.operator.update({ where: { id: operatorId }, data: { billingStatus: "trialing" } });
  assert((await checkoutTargetForEmail(prisma, EMAIL)).kind === "paid", "paid → treated as an existing customer");
  assert((await loadPrefillDraft(prisma, second.code)) === null, "once paid, the code is dead");
  assert((await prisma.onboardingDraft.findUnique({ where: { email: EMAIL } })) === null, "and the draft is cleaned up");
  const again = await createPrefill(prisma, "david", base);
  assert(!again.ok, "the AE form refuses an email that already belongs to a paying customer");

  await cleanup();
  console.log("\nAE prefill smoke test PASSED.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma?.$disconnect());
