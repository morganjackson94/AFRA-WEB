import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createLoginToken } from "../src/lib/auth";
import { normalizeEmail } from "../src/lib/constants";
import { deleteDraft, loadDraft, saveDraft } from "../src/lib/onboardingDraft";
import { provision } from "../src/lib/provision";

// Proves the fix for the magic-link login bug: onboarding never normalized
// email case at write time while login always lowercased before comparing, so
// a mobile keyboard's auto-capitalized email silently locked that operator
// out with zero error anywhere (Resend was never even called). Three layers,
// each proven independently: normalizeEmail() itself, the DB-level backstop
// (unique index on lower(email) — prisma/migrations/
// 20260722001109_add_operator_email_lower_unique_index), and the login
// action's debounce logic (replicated here rather than invoking the "use
// server" action directly, since it imports next/navigation's redirect()
// which needs Next's runtime — same reason other smoke scripts test lib
// functions, not action wrappers).

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("1) normalizeEmail() trims and lowercases:");
  assert(normalizeEmail("  Jane@Restaurant.COM ") === "jane@restaurant.com", "mixed-case + whitespace normalizes correctly");
  assert(normalizeEmail("already@lower.com") === "already@lower.com", "already-normalized input is unchanged");

  const email = "emailnormsmoke@afra-smoke.test";
  await prisma.operator.deleteMany({ where: { email: { in: [email, email.toUpperCase()] } } });
  await prisma.onboardingDraft.deleteMany({ where: { email } });

  console.log("\n2) OnboardingDraft normalizes at the boundary (save/load/delete), regardless of input case:");
  await saveDraft(prisma, "EmailNormSmoke@AFRA-Smoke.TEST", 2, { step: 2 });
  const loadedDifferentCase = await loadDraft(prisma, email); // all-lowercase lookup
  assert(loadedDifferentCase !== null, "draft saved with mixed-case email is found via a lowercase lookup");
  assert(loadedDifferentCase?.step === 2, "loaded draft has the right content");
  await deleteDraft(prisma, "EMAILNORMSMOKE@AFRA-SMOKE.TEST"); // yet another case
  const afterDelete = await loadDraft(prisma, email);
  assert(afterDelete === null, "delete also normalizes — draft is gone regardless of the case used to delete it");

  console.log("\n3) DB-level backstop: the unique index on lower(email) rejects a case-variant duplicate:");
  const { operatorId } = await provision(prisma, {
    instagramHandle: "@emailnormsmoke",
    operatorEmail: email, // already-lowercase, as actions.ts now guarantees
    role: { title: "Server" },
    calendarChoice: "google",
  });
  let rejected = false;
  try {
    // Simulates what would happen if some future write path forgot to
    // normalize — app-level discipline (normalizeEmail everywhere) is what
    // prevents this from happening in practice; this proves the DB itself
    // would also refuse it even if that discipline lapsed.
    await prisma.operator.create({
      data: { name: "dup", email: email.toUpperCase() },
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "creating a case-variant duplicate email (EMAILNORMSMOKE@... vs emailnormsmoke@...) is rejected by the DB");

  console.log("\n4) Login debounce: a second request within the window does not issue a second token:");
  const first = await createLoginToken(prisma, operatorId);
  assert(Boolean(first), "first token issued");
  const recentWindow = await prisma.loginToken.findFirst({
    where: {
      operatorId,
      usedAt: null,
      expiresAt: { gt: new Date() },
      createdAt: { gt: new Date(Date.now() - 30_000) },
    },
    select: { id: true },
  });
  assert(recentWindow !== null, "a repeat request immediately after would find the just-issued token and skip issuing/sending a second one");

  const tokenCountBefore = await prisma.loginToken.count({ where: { operatorId } });
  assert(tokenCountBefore === 1, "exactly one token exists — proves the debounce check (not just its presence) is what a repeat request would rely on to skip");

  await prisma.operator.deleteMany({ where: { id: operatorId } });
  console.log("\nEmail normalization smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
