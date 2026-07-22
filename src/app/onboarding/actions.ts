"use server";

import { redirect } from "next/navigation";
import { countActiveFoundingOperators, startFoundingCheckout } from "../../lib/activation";
import { FOUNDING_SPOTS_TOTAL, getBillingProvider } from "../../lib/billing";
import { CONTACT_EMAIL, normalizeEmail } from "../../lib/constants";
import { isRestrictedJurisdiction } from "../../lib/jurisdiction";
import { type DraftAnswers, deleteDraft, loadDraft, saveDraft } from "../../lib/onboardingDraft";
import { prisma } from "../../lib/prisma";
import { provision } from "../../lib/provision";
import { computeReachFlag, locationCountForBucket } from "../../lib/qualification";
import { appBaseUrl, createSession } from "../../lib/session";
import { validateOtherRoleText } from "../../lib/textSanitize";

export type OnboardingState = { error?: string };
export type LeadState = { submitted?: boolean; error?: string };

const ROLE_TITLES = ["Front of House", "Back of House", "Barista", "Line Cook"];
const CALENDAR_CHOICES = ["google", "microsoft", "other"];

// Progressive-save actions (Onboarding Wizard redesign) — called directly by
// the client component after every step, not via a <form> submit. Both are
// resilient no-ops on a blank/invalid email so an unfinished step 1 never
// throws.
export async function saveOnboardingDraftAction(
  email: string,
  step: number,
  answers: DraftAnswers,
): Promise<{ restricted: boolean }> {
  return saveDraft(prisma, email, step, answers);
}

export async function loadOnboardingDraftAction(
  email: string,
): Promise<{ step: number; answers: DraftAnswers } | null> {
  return loadDraft(prisma, email);
}

// Completes onboarding. Two paths, both: validate -> provision() the instance ->
// set a session. Then:
//   founding (default — what the landing sells): provision WITHOUT a trial, then
//     redirect to Stripe-hosted Checkout for the one-time $1,990 charge. Billing
//     flips to "active" only on the webhook-confirmed payment (gateBilling honest).
//   monthly (kept intact): provision starts the $199/mo trial, land on dashboard.
// Either way the dashboard reads "finishing setup / not live" (channel/calendar
// stubbed) — paying does not make an operator live.
export async function startOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const instagramHandle = String(formData.get("instagramHandle") ?? "").trim();
  const facebookHandle = String(formData.get("facebookHandle") ?? "").trim() || undefined;
  const pay = String(formData.get("pay") ?? "").trim();
  const calendarChoice = String(formData.get("calendarChoice") ?? "").trim();
  // Required (see docs/CLAIMS.md 2.5) — this is what makes "candidates book
  // straight into your calendar" true. Without it there's no booking node to
  // add to the operator's cloned ManyChat flow, and the claim breaks for them
  // specifically. Presence re-validated below; no format check beyond the
  // client's native type="url" hint.
  const bookingLinkUrl = String(formData.get("bookingLinkUrl") ?? "").trim() || undefined;
  // Normalized here, not just at login-time comparison — Operator.email has
  // no case-insensitive constraint, so storing whatever case a mobile
  // keyboard's auto-capitalize produced (the default on a bare email field)
  // would silently desync from a later, correctly-lowercased login lookup.
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const plan = String(formData.get("plan") ?? "founding").trim(); // "founding" | "monthly"
  const tosAccepted = formData.get("tosAccepted") === "true";

  // Roles (multi-select + optional sanitized "Other"). Never trust the
  // client's own sanity check — re-validate every title here. A title not in
  // ROLE_TITLES must independently pass validateOtherRoleText.
  let roleTitles: string[];
  try {
    roleTitles = JSON.parse(String(formData.get("roles") ?? "[]"));
  } catch {
    roleTitles = [];
  }
  roleTitles = roleTitles.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  for (const t of roleTitles) {
    if (!ROLE_TITLES.includes(t) && !validateOtherRoleText(t).ok) {
      return { error: "One of the roles you entered doesn't look right." };
    }
  }

  // Disqualifiers (5a, deterministic knockouts) — informational-only slugs
  // from a fixed list on the client; not independently re-validated here
  // since nothing downstream trusts them to be exhaustive or gates on them.
  let disqualifiers: string[];
  try {
    disqualifiers = JSON.parse(String(formData.get("disqualifiers") ?? "[]"));
  } catch {
    disqualifiers = [];
  }
  disqualifiers = disqualifiers.filter((d): d is string => typeof d === "string" && d.trim() !== "");
  // 5b, optional free text — captured raw only; parsing into screener
  // questions is out of scope for this pass (no AI integration exists yet).
  const badHireText = String(formData.get("badHireText") ?? "").trim() || undefined;

  // Founding-qualification soft signal (see qualification.ts). Deliberately NOT
  // validated against the option lists and NEVER returns an error here — these
  // are informational only. Even a blank value must never block a real
  // operator from reaching checkout.
  const locationsBucket = String(formData.get("locationsBucket") ?? "").trim() || undefined;
  const followerBand = String(formData.get("followerBand") ?? "").trim() || undefined;
  const hiringFrequency = String(formData.get("hiringFrequency") ?? "").trim() || undefined;
  const reachFlag = computeReachFlag(followerBand);
  const primaryState = String(formData.get("primaryState") ?? "").trim();
  const locationStates = primaryState ? [primaryState] : [];
  const hasNycLocation = formData.get("hasNycLocation") === "true";

  if (roleTitles.length === 0) return { error: "Pick at least one role you're hiring for." };
  if (!CALENDAR_CHOICES.includes(calendarChoice)) return { error: "Choose a calendar." };
  if (!bookingLinkUrl) return { error: "Add your booking link — it's what lets candidates book their interview." };
  if (!instagramHandle) return { error: "Add the Instagram handle you use for hiring." };
  // Required: it's how you log back in. No email, no way to send a magic
  // link, no way back into your own dashboard after closing the tab.
  if (!email || !email.includes("@")) return { error: "Add your email so you can log back in later." };
  // Hard gate, unlike the qualification fields above: no consent, no checkout.
  if (!tosAccepted) return { error: "Agree to the Terms of Service and Privacy Policy to continue." };
  // Hard gate, computed independently of the client's own check (which
  // already ran this same check at step 2 of the wizard, before this action
  // is ever called) — a restricted operator must not reach checkout by
  // skipping the client and posting straight here. Full soft-block: ANY
  // restricted location rejects the whole submission, not just that location.
  if (isRestrictedJurisdiction(locationStates, hasNycLocation)) {
    return {
      error:
        "We can't offer AFRA for locations in New York City, Illinois, or Colorado right now. Leave your info on the previous step and we'll reach out when that changes.",
    };
  }

  const isFounding = plan !== "monthly";

  let operatorId: string;
  let checkoutUrl: string | undefined;
  try {
    // Hard gate — "first 10 only" is a public promise (see docs/CLAIMS.md); it
    // must not be breakable by a race or an oversight. Checked here, right
    // before provision()/Stripe, same spot as the other hard gates above.
    // Real-money confirmed seats only (billingStatus: "active") — an abandoned
    // Stripe session must not eat a seat from someone who actually pays.
    // Inside this try/catch (not before it) so a failure in the count query
    // itself returns the same graceful error as a provision() failure,
    // instead of an uncaught exception.
    if (isFounding) {
      const activeFoundingCount = await countActiveFoundingOperators(prisma);
      if (activeFoundingCount >= FOUNDING_SPOTS_TOTAL) {
        // Logged deliberately: this blocks a real signup with no other
        // trace. An incorrectly-tripped gate is otherwise indistinguishable
        // from "nobody bought today" — see Vercel function logs for
        // "[foundingCap]" if the cap ever looks wrong.
        console.error(
          `[foundingCap] blocked signup: count=${activeFoundingCount} cap=${FOUNDING_SPOTS_TOTAL} email=${email}`,
        );
        return {
          error: `Founding pricing has reached its cap of ${FOUNDING_SPOTS_TOTAL}. Email ${CONTACT_EMAIL} and we'll let you know if a spot opens up.`,
        };
      }
    }

    const result = await provision(
      prisma,
      {
        instagramHandle,
        facebookHandle,
        role: { title: roleTitles[0], pay: pay || undefined },
        roles: roleTitles.map((title) => ({ title, pay: pay || undefined })),
        locationCount: locationsBucket ? locationCountForBucket(locationsBucket) : undefined,
        calendarChoice,
        bookingLinkUrl,
        // Always real now (required above) — the Stripe customer/checkout
        // email AND the magic-link login address.
        operatorEmail: email,
        locationsBucket,
        followerBand,
        hiringFrequency,
        reachFlag,
        locationStates,
        hasNycLocation,
        disqualifiers,
        badHireText,
        tosAccepted,
      },
      // Founding is paid-from-day-one: NO monthly trial. Monthly keeps the trial.
      { startTrial: !isFounding },
    );
    operatorId = result.operatorId;

    // Draft has served its purpose — this operator is now a real, queryable
    // instance (see provision()'s tree); nothing left to resume.
    await deleteDraft(prisma, email);

    if (isFounding) {
      // Set the session before leaving for Stripe so they're logged in on return.
      await createSession(operatorId);
      const base = appBaseUrl();
      const checkout = await startFoundingCheckout(prisma, getBillingProvider(), operatorId, {
        // Stripe substitutes the literal "{CHECKOUT_SESSION_ID}" placeholder
        // with the real session id before redirecting — keep the braces
        // literal here, do not template-interpolate them. /welcome fires the
        // Meta Purchase pixel event (eventID = that session id) then hands
        // off to the existing dashboard post-payment welcome UX.
        successUrl: `${base}/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/onboarding?canceled=1`,
      });
      checkoutUrl = checkout.checkoutUrl;
    }
  } catch (err) {
    console.error("[onboarding] startOnboardingAction failed:", err);
    return { error: "Something went wrong creating your account. Please try again." };
  }

  if (isFounding && checkoutUrl) {
    // Off to Stripe-hosted checkout. (redirect() throws by design.)
    redirect(checkoutUrl);
  }

  await createSession(operatorId);
  redirect("/dashboard");
}

// The three redirects in the qualification step: "0 locations" (not yet an
// operator), "15+ locations" (bigger than founding fulfillment capacity can
// take at flat pricing), and a restricted jurisdiction (NYC/IL/CO — see
// src/lib/jurisdiction.ts). All three route here instead of checkout to
// capture a Lead (a maybe-later contact, deliberately NOT an Operator
// record) — no provisioning, no charge. The reason comes from a fixed hidden
// input driven by isNonOperator/isOverCapacity/isRestrictedJurisdiction (see
// OnboardingWizard), not free user text.
const LEAD_REASONS = new Set(["0_locations", "over_capacity", "restricted_jurisdiction"]);

export async function submitQualificationLeadAction(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email || !email.includes("@")) return { error: "That email doesn't look right." };

  const reasonInput = String(formData.get("reason") ?? "").trim();
  const reason = LEAD_REASONS.has(reasonInput) ? reasonInput : "0_locations";
  // Free text, but only ever machine-generated by OnboardingWizard from
  // matchedRestrictedJurisdictions() — not typed by the operator.
  const detail = String(formData.get("detail") ?? "").trim() || undefined;

  await prisma.lead.create({ data: { email, reason, detail } });
  return { submitted: true };
}
