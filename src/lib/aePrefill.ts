import { createHmac, randomInt, timingSafeEqual } from "crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { hashToken } from "./auth";
import { normalizeEmail } from "./constants";
import { isRestrictedJurisdiction } from "./jurisdiction";
import { CALENDAR_IDS, DISQUALIFIER_VALUES, ROLE_TITLES } from "./onboardingOptions";
import { FOLLOWER_BANDS, HIRING_FREQUENCIES, LOCATION_BUCKETS, US_STATES } from "./qualification";
import { validateOtherRoleText } from "./textSanitize";

// AE pre-filled setup link. On a sales call the AE fills in the operator's
// answers (src/app/ae/new), which creates an OnboardingDraft carrying a short
// code. The operator opens afravisibility.com/go, types the code, lands on a
// review screen with everything filled in, ticks the terms and pays the $149.
//
// The code is a short-lived key to ONE draft. Same hash-only idiom as
// LoginToken: the raw code is never stored. It stops working when the
// operator has paid (see isPaidStatus) or PREFILL_TTL_MS passes. A new code
// for the same email replaces the old one (the draft is keyed by email).
//
// No PII ever goes in a URL: /go/<code> trades the code for an httpOnly
// cookie (PREFILL_COOKIE) and redirects to /onboarding?review=1.

export const PREFILL_COOKIE = "afra_prefill";
export const PREFILL_COOKIE_MAX_AGE_S = 2 * 60 * 60; // 2 hours
export const PREFILL_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

/** 31 characters: no 0/O, 1/I/L, so a code survives being read out over the phone. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** Failed /go lookups allowed per IP inside RATE_LIMIT_WINDOW_MS before lockout. */
export const RATE_LIMIT_MAX_FAILURES = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** The wizard's sentinel role value for a free-text "Other" role. */
export const OTHER_ROLE = "__other__";

export function generatePrefillCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Uppercase, strip spaces/dashes. Returns null unless it's a well-formed code. */
export function normalizePrefillCode(raw: string): string | null {
  const code = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function hashPrefillCode(code: string): string {
  return hashToken(code);
}

/** "none" (never provisioned) and "trial_pending" (provisioned, not yet paid)
 *  are the only pre-payment states. Anything else means a real customer. */
export function isPaidStatus(billingStatus: string | null | undefined): boolean {
  return !!billingStatus && billingStatus !== "none" && billingStatus !== "trial_pending";
}

// --- AE accounts -------------------------------------------------------------
// AE_ACCOUNTS is JSON: {"david":"<passphrase>"}. One passphrase per AE so
// every code (and every operator it converts) carries who closed it. The AE
// cookie is "<aeId>.<hmac>" keyed by that AE's own passphrase, so rotating a
// passphrase signs that AE out everywhere.

export const AE_COOKIE = "afra_ae";
export const AE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export function parseAeAccounts(raw: string | undefined = process.env.AE_ACCOUNTS): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, pass] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^[a-z0-9_-]{1,32}$/.test(id) && typeof pass === "string" && pass.length >= 8) out[id] = pass;
    }
    return out;
  } catch {
    return {};
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns the AE id whose passphrase matches, else null. */
export function findAeByPassphrase(passphrase: string, accounts = parseAeAccounts()): string | null {
  for (const [id, pass] of Object.entries(accounts)) if (safeEqual(passphrase, pass)) return id;
  return null;
}

function aeSignature(aeId: string, passphrase: string): string {
  return createHmac("sha256", passphrase).update(`afra-ae:${aeId}`).digest("base64url");
}

export function aeCookieValue(aeId: string, accounts = parseAeAccounts()): string | null {
  const pass = accounts[aeId];
  return pass ? `${aeId}.${aeSignature(aeId, pass)}` : null;
}

/** Verifies an AE cookie value; returns the AE id or null. */
export function verifyAeCookie(value: string | undefined, accounts = parseAeAccounts()): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const aeId = value.slice(0, dot);
  const pass = accounts[aeId];
  if (!pass) return null;
  return safeEqual(value.slice(dot + 1), aeSignature(aeId, pass)) ? aeId : null;
}

// --- Creating a prefill (AE side) ---------------------------------------------

export type AePrefillInput = {
  email: string;
  /** What the restaurant calls itself. Becomes Operator.name (it otherwise
   *  defaults to the Instagram handle) and ManyChat's business-name blank. */
  businessName?: string;
  locationsBucket: string;
  primaryState: string;
  hasNycLocation: boolean;
  /** Role titles: ROLE_TITLES entries plus at most one free-text "Other". */
  roles: string[];
  pay?: string;
  disqualifiers: string[];
  badHireText?: string;
  handle: string;
  facebookHandle?: string;
  followerBand: string;
  hiringFrequency: string;
  calendarChoice: string;
  bookingLinkUrl?: string;
};

export type CreatePrefillResult =
  | { ok: true; code: string; expiresAt: Date; email: string }
  | { ok: false; error: string };

const KNOWN_ROLES: readonly string[] = ROLE_TITLES;
const values = (list: readonly { value: string }[]) => list.map((o) => o.value);

/** Validates the AE's answers with the same rules the wizard and
 *  startOnboardingAction apply, then saves them as the operator's draft in
 *  the exact shape OnboardingWizard's buildAnswers() produces. */
export async function createPrefill(
  prisma: PrismaClient,
  aeRef: string,
  input: AePrefillInput,
  now: Date = new Date(),
): Promise<CreatePrefillResult> {
  const email = normalizeEmail(input.email ?? "");
  if (!email || !email.includes("@")) return { ok: false, error: "Add the operator's email." };
  if (!values(LOCATION_BUCKETS).includes(input.locationsBucket)) return { ok: false, error: "Pick how many locations they run." };
  if (!values(US_STATES).includes(input.primaryState)) return { ok: false, error: "Pick their main state." };
  if (isRestrictedJurisdiction([input.primaryState], input.primaryState === "NY" && input.hasNycLocation)) {
    return {
      ok: false,
      error: "We can't serve New York City, Illinois or Colorado yet. Don't take payment; let them know we'll reach out.",
    };
  }

  const titles = (input.roles ?? []).map((r) => String(r).trim()).filter(Boolean);
  if (titles.length === 0) return { ok: false, error: "Pick at least one role." };
  const known = titles.filter((t) => KNOWN_ROLES.includes(t));
  const others = titles.filter((t) => !KNOWN_ROLES.includes(t));
  if (others.length > 1) return { ok: false, error: "Only one \"Other\" role fits. Add the rest on the setup call." };
  let otherRoleText = "";
  if (others.length === 1) {
    const v = validateOtherRoleText(others[0]);
    if (!v.ok) return { ok: false, error: v.error };
    otherRoleText = v.value;
  }

  const handle = (input.handle ?? "").trim();
  if (!handle) return { ok: false, error: "Add their Instagram handle." };
  if (!values(FOLLOWER_BANDS).includes(input.followerBand)) return { ok: false, error: "Pick their follower range." };
  if (!values(HIRING_FREQUENCIES).includes(input.hiringFrequency)) return { ok: false, error: "Pick how often they hire." };
  if (!CALENDAR_IDS.includes(input.calendarChoice)) return { ok: false, error: "Pick their calendar type." };

  const existing = await prisma.operator.findUnique({ where: { email }, select: { billingStatus: true } });
  if (existing && isPaidStatus(existing.billingStatus)) {
    return { ok: false, error: "Already a customer. Send them to log in at afravisibility.com/login." };
  }

  const businessName = (input.businessName ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

  const answers = {
    email,
    businessName,
    locationsBucket: input.locationsBucket,
    primaryState: input.primaryState,
    hasNycLocation: input.primaryState === "NY" ? input.hasNycLocation : false,
    roles: [...known, ...(otherRoleText ? [OTHER_ROLE] : [])],
    otherRoleText,
    pay: (input.pay ?? "").trim(),
    disqualifiers: (input.disqualifiers ?? []).filter((d) => DISQUALIFIER_VALUES.includes(d)),
    badHireText: (input.badHireText ?? "").trim(),
    handle,
    facebookHandle: (input.facebookHandle ?? "").trim(),
    followerBand: input.followerBand,
    hiringFrequency: input.hiringFrequency,
    calendarChoice: input.calendarChoice,
    bookingLinkUrl: (input.bookingLinkUrl ?? "").trim(),
    tosAccepted: false,
  };

  const expiresAt = new Date(now.getTime() + PREFILL_TTL_MS);
  // A collision on the unique hash is astronomically unlikely, but cheap to retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePrefillCode();
    const prefill = {
      step: 7,
      answers: answers as Prisma.InputJsonValue,
      prefillCodeHash: hashPrefillCode(code),
      prefillExpiresAt: expiresAt,
      prefillOpenedAt: null,
      aeRef,
    };
    try {
      await prisma.onboardingDraft.upsert({
        where: { email },
        create: { email, ...prefill },
        update: prefill,
      });
      return { ok: true, code, expiresAt, email };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
  return { ok: false, error: "Couldn't create a code. Try again." };
}

// --- Opening a prefill (operator side) ----------------------------------------

export type PrefillDraft = {
  draftId: string;
  email: string;
  answers: Record<string, unknown>;
  aeRef: string | null;
};

/** The draft a code opens, or null if the code is unknown, expired, or the
 *  operator it was made for has already paid. No rate limiting here — callers
 *  that take codes from the outside world go through resolvePrefillCode. */
export async function loadPrefillDraft(
  prisma: PrismaClient,
  rawCode: string | undefined,
  now: Date = new Date(),
): Promise<PrefillDraft | null> {
  const code = normalizePrefillCode(rawCode ?? "");
  if (!code) return null;
  const draft = await prisma.onboardingDraft.findUnique({ where: { prefillCodeHash: hashPrefillCode(code) } });
  if (!draft || !draft.prefillExpiresAt || draft.prefillExpiresAt <= now) return null;

  const operator = await prisma.operator.findUnique({ where: { email: draft.email }, select: { billingStatus: true } });
  if (operator && isPaidStatus(operator.billingStatus)) {
    // Paid: the draft has done its job. Clean it up so the code is dead for good.
    await prisma.onboardingDraft.deleteMany({ where: { id: draft.id } });
    return null;
  }
  return {
    draftId: draft.id,
    email: draft.email,
    answers: (draft.answers ?? {}) as Record<string, unknown>,
    aeRef: draft.aeRef,
  };
}

export type ResolveResult = { ok: true; code: string } | { ok: false; reason: "locked" | "invalid" };

/** Entry point for a code typed by the operator (/go). Rate-limited per IP:
 *  RATE_LIMIT_MAX_FAILURES failed lookups inside RATE_LIMIT_WINDOW_MS locks
 *  that IP out until the window passes. Only failures are recorded. */
export async function resolvePrefillCode(
  prisma: PrismaClient,
  rawCode: string,
  ip: string,
  now: Date = new Date(),
): Promise<ResolveResult> {
  const ipHash = hashToken(`prefill-ip:${ip || "unknown"}`);
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const failures = await prisma.prefillAttempt.count({ where: { ipHash, createdAt: { gt: since } } });
  if (failures >= RATE_LIMIT_MAX_FAILURES) return { ok: false, reason: "locked" };

  const draft = await loadPrefillDraft(prisma, rawCode, now);
  if (!draft) {
    await prisma.prefillAttempt.create({ data: { ipHash, createdAt: now } });
    // Opportunistic cleanup so the table never grows without bound.
    await prisma.prefillAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
    return { ok: false, reason: "invalid" };
  }

  await prisma.onboardingDraft.updateMany({
    where: { id: draft.draftId, prefillOpenedAt: null },
    data: { prefillOpenedAt: now },
  });
  return { ok: true, code: normalizePrefillCode(rawCode) as string };
}

// --- Retrying checkout --------------------------------------------------------

/** What startOnboardingAction should do for an email before provisioning:
 *  "new" — no Operator yet, provision one; "unpaid" — an Operator exists but
 *  never paid (they backed out of Stripe), reuse it and start a fresh
 *  Checkout instead of tripping Operator.email's unique constraint; "paid" —
 *  a real customer, send them to log in. */
export async function checkoutTargetForEmail(
  prisma: PrismaClient,
  rawEmail: string,
): Promise<{ kind: "new" } | { kind: "unpaid"; operatorId: string } | { kind: "paid" }> {
  const email = normalizeEmail(rawEmail);
  const operator = await prisma.operator.findUnique({ where: { email }, select: { id: true, billingStatus: true } });
  if (!operator) return { kind: "new" };
  return isPaidStatus(operator.billingStatus) ? { kind: "paid" } : { kind: "unpaid", operatorId: operator.id };
}
