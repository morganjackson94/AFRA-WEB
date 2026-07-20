"use server";

import { redirect } from "next/navigation";
import { startFoundingCheckout } from "../../lib/activation";
import { getBillingProvider } from "../../lib/billing";
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
  // Optional — many operators set this up together with the founder on the
  // concierge call rather than alone at onboarding. No validation beyond the
  // browser's native type="url" input; never blocks checkout either way.
  const bookingLinkUrl = String(formData.get("bookingLinkUrl") ?? "").trim() || undefined;
  const email = String(formData.get("email") ?? "").trim();
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
  } catch {
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
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) return { error: "That email doesn't look right." };

  const reasonInput = String(formData.get("reason") ?? "").trim();
  const reason = LEAD_REASONS.has(reasonInput) ? reasonInput : "0_locations";
  // Free text, but only ever machine-generated by OnboardingWizard from
  // matchedRestrictedJurisdictions() — not typed by the operator.
  const detail = String(formData.get("detail") ?? "").trim() || undefined;

  await prisma.lead.create({ data: { email, reason, detail } });
  return { submitted: true };
}
