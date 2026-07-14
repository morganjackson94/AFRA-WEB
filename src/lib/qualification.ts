// Founding-Operator qualification — a SOFT SIGNAL captured right before Stripe
// checkout, never a gate. Every value here is shared between the client step
// (OnboardingWizard) and the server action that persists it, so the two never
// drift on what a valid bucket/band/frequency value is.
//
// The one hard rule this file encodes: nothing in here can stop a real
// operator from reaching checkout. The "0" locations bucket is the sole
// exception — it's not a disqualifying ANSWER, it's a signal they're not
// actually a hospitality operator yet, and even that redirects gracefully
// (see the Lead capture) rather than blocking a form submission.

export const LOCATION_BUCKETS = [
  { value: "0", label: "I don't have a location yet" },
  { value: "1", label: "1" },
  { value: "2-3", label: "2-3" },
  { value: "4-8", label: "4-8" },
  { value: "9-15", label: "9-15" },
  { value: "15+", label: "15+" },
] as const;

export const FOLLOWER_BANDS = [
  { value: "under_500", label: "Under 500" },
  { value: "500_2k", label: "500-2k" },
  { value: "2k_10k", label: "2k-10k" },
  { value: "10k_plus", label: "10k+" },
] as const;

export const HIRING_FREQUENCIES = [
  { value: "rarely", label: "Rarely" },
  { value: "occasionally", label: "Occasionally" },
  { value: "constantly", label: "Constantly" },
] as const;

export type LocationBucket = (typeof LOCATION_BUCKETS)[number]["value"];
export type FollowerBand = (typeof FOLLOWER_BANDS)[number]["value"];
export type HiringFrequency = (typeof HIRING_FREQUENCIES)[number]["value"];

/** The "0 locations" answer is the ONLY thing that redirects instead of
 *  proceeding to checkout — it means "not a hospitality operator yet", not
 *  "disqualified". Every other combination of answers proceeds normally. */
export function isNonOperator(locationsBucket: string): boolean {
  return locationsBucket === "0";
}

/** Flat founding pricing ($1,990 covers every location) means a large chain
 *  claiming a founding spot could swamp manual fulfillment capacity. "15+"
 *  is the other redirect-instead-of-checkout answer — same graceful Lead
 *  capture pattern as isNonOperator, not a disqualification. Buckets 1
 *  through "9-15" all proceed normally. */
export function isOverCapacity(locationsBucket: string): boolean {
  return locationsBucket === "15+";
}

/** Tunable threshold for the internal (never operator-facing) reach flag.
 *  Add/remove bands here to adjust who gets flagged for concierge follow-up —
 *  this never blocks anyone, it only changes who gets the extra note + the
 *  internal flag. */
export const LOW_REACH_FOLLOWER_BANDS = new Set<string>(["under_500"]);

export function computeReachFlag(followerBand: string | null | undefined): boolean {
  return !!followerBand && LOW_REACH_FOLLOWER_BANDS.has(followerBand);
}

function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export const locationsBucketLabel = (v: string) => labelFor(LOCATION_BUCKETS as never, v);
export const followerBandLabel = (v: string) => labelFor(FOLLOWER_BANDS as never, v);
export const hiringFrequencyLabel = (v: string) => labelFor(HIRING_FREQUENCIES as never, v);
