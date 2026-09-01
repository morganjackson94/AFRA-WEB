// Presentation logic for the dashboard. This reads the gate booleans + readiness
// state that evaluateReadiness() already produced and persisted on the Role — it
// does NOT recompute gates. Its whole job is to turn that honest state into copy
// without blurring "ready" (configured, NOT accepting applicants) into "live".

import { ANNUAL_PRICE_CENTS, FREE_CANDIDATE_CAP, trialBackstopDate } from "./billing";

const ANNUAL_PRICE_DISPLAY = `$${(ANNUAL_PRICE_CENTS / 100).toLocaleString("en-US")}`; // $4,788
const MONTHLY_EQUIVALENT_DISPLAY = `$${Math.round(ANNUAL_PRICE_CENTS / 12 / 100)}`; // $399

export type GateState = {
  readinessState: string; // "pending" | "ready" | "live"
  gatePlatform: boolean;
  gateCalendar: boolean;
  gateTemplate: boolean;
  gateBilling: boolean;
};

export type PendingItem = { key: string; label: string; cta: string };

export type ReadinessDisplay = {
  /** "live" only when truly live; "setup" otherwise. Drives badge color/wording. */
  tone: "live" | "setup";
  /** Whether candidates can actually reach this operator right now. */
  acceptingApplicants: boolean;
  headline: string;
  subtext: string;
  /** What still has to happen before going live (empty when live). */
  pending: PendingItem[];
};

/** The unmet gates, in the order an operator should tackle them. */
function pendingItems(g: GateState): PendingItem[] {
  const items: PendingItem[] = [];
  if (!g.gateTemplate) {
    items.push({ key: "template", label: "Hiring post isn't finished", cta: "Finish hiring post" });
  }
  if (!g.gatePlatform) {
    items.push({ key: "platform", label: "Instagram isn't connected", cta: "Connect Instagram" });
  }
  if (!g.gateCalendar) {
    items.push({ key: "calendar", label: "Calendar isn't connected", cta: "Connect calendar" });
  }
  if (!g.gateBilling) {
    items.push({ key: "billing", label: "Billing isn't active", cta: "Add billing" });
  }
  return items;
}

/**
 * Map honest gate state to operator-facing copy. The critical contract:
 *   - "live"  -> and ONLY "live" -> says "You're live — accepting applicants".
 *   - "ready" -> "Almost there — finishing setup" and explicitly NOT accepting.
 *   - else    -> "Finish setup".
 */
export function describeReadiness(g: GateState): ReadinessDisplay {
  if (g.readinessState === "live") {
    return {
      tone: "live",
      acceptingApplicants: true,
      headline: "You're live — accepting applicants",
      subtext: "Your hiring link is active and candidates can reach you.",
      pending: [],
    };
  }

  if (g.readinessState === "ready") {
    return {
      tone: "setup",
      acceptingApplicants: false,
      headline: "Almost there — finishing setup",
      subtext:
        "You're not accepting applicants yet. A few things still need to connect before you go live.",
      pending: pendingItems(g),
    };
  }

  // "pending" / anything else — setup not yet configured.
  return {
    tone: "setup",
    acceptingApplicants: false,
    headline: "Finish setup",
    subtext: "Let's get your hiring post ready so you can go live.",
    pending: pendingItems(g),
  };
}

/** Operator-facing billing summary copy from billingStatus + plan. `extra` is
 *  only meaningful for the founding-annual plan's "trialing" state — the
 *  other plan/status combinations ignore it. */
export function describeBilling(
  billingStatus: string,
  plan: string = "monthly",
  extra?: { screenedCandidateCount?: number; trialStartedAt?: Date },
): { label: string; detail: string } {
  if (plan === "founding_annual") {
    switch (billingStatus) {
      case "trialing": {
        const used = extra?.screenedCandidateCount ?? 0;
        const startedAt = extra?.trialStartedAt;
        const byDate = startedAt
          ? trialBackstopDate(startedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : null;
        return {
          label: "Free trial",
          detail: byDate
            ? `${used} of ${FREE_CANDIDATE_CAP} free candidates used. Free until ${byDate} otherwise.`
            : `${used} of ${FREE_CANDIDATE_CAP} free candidates used.`,
        };
      }
      case "active":
        return { label: "Active", detail: `${ANNUAL_PRICE_DISPLAY}/year (about ${MONTHLY_EQUIVALENT_DISPLAY}/month), billed annually.` };
      case "past_due":
        return { label: "Payment failed", detail: "Update your card to keep your plan active." };
      case "trial_pending":
        return { label: "Payment pending", detail: "Complete checkout to start your free trial." };
      case "canceled":
        return { label: "Canceled", detail: "Your subscription has been canceled." };
      default:
        return { label: "No plan", detail: "No active subscription." };
    }
  }
  switch (billingStatus) {
    case "trialing":
      return { label: "Free trial", detail: "2-week trial active — $199/mo per location after." };
    case "active":
      return { label: "Active", detail: "$199/mo per location." };
    case "past_due":
      return { label: "Payment failed", detail: "Update your card to keep your plan active." };
    case "canceled":
      return { label: "Canceled", detail: "Your subscription has been canceled." };
    case "trial_pending":
      return { label: "Setting up", detail: "Finishing billing setup." };
    default:
      return { label: "No plan", detail: "No active subscription." };
  }
}

/** Location-scoped hiring link. MUST carry location_id so routing works later. */
export function hiringLinkFor(locationId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/apply?location_id=${encodeURIComponent(locationId)}`;
}
