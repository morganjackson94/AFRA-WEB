"use server";

import { redirect } from "next/navigation";
import { startFoundingCheckout } from "../../lib/activation";
import { getBillingProvider } from "../../lib/billing";
import { prisma } from "../../lib/prisma";
import { provision } from "../../lib/provision";
import { computeReachFlag } from "../../lib/qualification";
import { appBaseUrl, createSession } from "../../lib/session";

export type OnboardingState = { error?: string };
export type LeadState = { submitted?: boolean; error?: string };

const ROLE_TITLES = ["Front of House", "Back of House", "Barista", "Line Cook"];
const CALENDAR_CHOICES = ["google", "microsoft", "other"];

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
  const title = String(formData.get("role") ?? "").trim();
  const pay = String(formData.get("pay") ?? "").trim();
  const calendarChoice = String(formData.get("calendarChoice") ?? "").trim();
  // Optional — many operators set this up together with the founder on the
  // concierge call rather than alone at onboarding. No validation beyond the
  // browser's native type="url" input; never blocks checkout either way.
  const bookingLinkUrl = String(formData.get("bookingLinkUrl") ?? "").trim() || undefined;
  const email = String(formData.get("email") ?? "").trim();
  const plan = String(formData.get("plan") ?? "founding").trim(); // "founding" | "monthly"
  const tosAccepted = formData.get("tosAccepted") === "true";

  // Founding-qualification soft signal (see qualification.ts). Deliberately NOT
  // validated against the option lists and NEVER returns an error here — these
  // are informational only. The UI only ever submits here once real answers are
  // picked (including routing "0 locations" and "15+ locations" to a completely
  // different action, submitQualificationLeadAction, before this one is ever
  // called), but even a blank value must never block a real operator from
  // reaching checkout.
  const locationsBucket = String(formData.get("locationsBucket") ?? "").trim() || undefined;
  const followerBand = String(formData.get("followerBand") ?? "").trim() || undefined;
  const hiringFrequency = String(formData.get("hiringFrequency") ?? "").trim() || undefined;
  const reachFlag = computeReachFlag(followerBand);

  if (!instagramHandle) return { error: "Add the Instagram handle you use for hiring." };
  if (!ROLE_TITLES.includes(title)) return { error: "Pick the role you're hiring for." };
  if (!CALENDAR_CHOICES.includes(calendarChoice)) return { error: "Choose a calendar." };
  // Required now (was optional): it's how you log back in. No email, no way to
  // send a magic link, no way back into your own dashboard after closing the tab.
  if (!email || !email.includes("@")) return { error: "Add your email so you can log back in later." };
  // Hard gate, unlike the qualification fields above: no consent, no checkout.
  if (!tosAccepted) return { error: "Agree to the Terms of Service and Privacy Policy to continue." };

  const isFounding = plan !== "monthly";

  let operatorId: string;
  let checkoutUrl: string | undefined;
  try {
    const result = await provision(
      prisma,
      {
        instagramHandle,
        role: { title, pay: pay || undefined },
        calendarChoice,
        bookingLinkUrl,
        // Always real now (required above) — the Stripe customer/checkout
        // email AND the magic-link login address.
        operatorEmail: email,
        locationsBucket,
        followerBand,
        hiringFrequency,
        reachFlag,
        tosAccepted,
      },
      // Founding is paid-from-day-one: NO monthly trial. Monthly keeps the trial.
      { startTrial: !isFounding },
    );
    operatorId = result.operatorId;

    if (isFounding) {
      // Set the session before leaving for Stripe so they're logged in on return.
      await createSession(operatorId);
      const base = appBaseUrl();
      const checkout = await startFoundingCheckout(prisma, getBillingProvider(), operatorId, {
        successUrl: `${base}/dashboard?checkout=success`,
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

// The two redirects in the qualification step: "0 locations" (not yet an
// operator) and "15+ locations" (bigger than founding fulfillment capacity
// can take at flat pricing). Both route here instead of checkout to capture
// a Lead (a maybe-later contact, deliberately NOT an Operator record) — no
// provisioning, no charge. The reason comes from a fixed hidden input driven
// by isNonOperator/isOverCapacity (see OnboardingWizard), not free user text.
const LEAD_REASONS = new Set(["0_locations", "over_capacity"]);

export async function submitQualificationLeadAction(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) return { error: "That email doesn't look right." };

  const reasonInput = String(formData.get("reason") ?? "").trim();
  const reason = LEAD_REASONS.has(reasonInput) ? reasonInput : "0_locations";

  await prisma.lead.create({ data: { email, reason } });
  return { submitted: true };
}
