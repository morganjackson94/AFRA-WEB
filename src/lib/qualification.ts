// Founding-Operator qualification — a SOFT SIGNAL captured right before Stripe
// checkout, never a gate. Every value here is shared between the client step
// (OnboardingWizard) and the server action that persists it, so the two never
// drift on what a valid bucket/band/frequency value is.
//
// Onboarding Wizard redesign: location count no longer redirects ANYONE away
// from checkout — even the extremes (1-2, 16+) just get a soft note and
// proceed. isNonOperator()/isOverCapacity() below are kept only so historical
// Operator rows written under the old "0"/"15+" buckets still label/read
// correctly; the wizard no longer calls them.
import { ANNUAL_PRICE_CENTS } from "./billing";

export const LOCATION_BUCKETS = [
  { value: "1-2", label: "1-2" },
  { value: "3-5", label: "3-5" },
  { value: "6-10", label: "6-10" },
  { value: "11-15", label: "11-15" },
  { value: "16+", label: "16+" },
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

// US states (+ DC) for the "which states are your locations in?" question.
// Two-letter codes, matching RESTRICTED_JURISDICTIONS in jurisdiction.ts —
// that file cross-references these codes, so don't rename them independently.
export const US_STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" }, { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const;

// Buckets are ranges, but provision() needs one concrete number. Uses the
// LOWER bound of each bucket so provision() never creates more blank,
// unconfigured Location shells than the operator has actually confirmed —
// they add more later (dashboard) rather than starting with clutter.
const LOCATION_COUNT_BY_BUCKET: Record<string, number> = {
  "1-2": 1,
  "3-5": 3,
  "6-10": 6,
  "11-15": 11,
  "16+": 16,
};

export function locationCountForBucket(bucket: string): number {
  return LOCATION_COUNT_BY_BUCKET[bucket] ?? 1;
}

// Per-location price framing (decided 2026-08-01, see docs/CLAIMS.md) — AFRA's
// flat $4,788/yr gets cheaper per location the more locations an operator
// runs, unlike per-location/per-seat competitors. Reflecting that back at the
// operator is honest arithmetic, not a fabricated stat.
//
// This displays a MONTHLY-equivalent per-location figure even though the
// underlying price is annual (see copy framing in docs/CLAIMS.md: "$4,788/year
// — about $399/month" keeps the monthly figure as an anchor) — so the annual
// total is divided by 12 before dividing by locationCount. Swapping
// MONTHLY_PRICE_CENTS for ANNUAL_PRICE_CENTS here without that /12 would
// silently multiply every displayed per-location number by 12.
//
// perLocationMonthlyDollars takes an EXACT count (used for the underlying
// math/tests). The wizard only ever has a BUCKET, so
// perLocationMonthlyDollarsForBucket uses each bucket's UPPER bound — the
// smallest true per-location cost anyone in that bucket could be paying —
// so the UI can honestly say "as low as ~$X/location/month" without
// presenting a bucketed estimate as an exact figure. "16+" has no upper
// bound; 16 (the bucket's own floor) is used as the last concrete number we
// have, which if anything undersells operators with many more locations.
// "1-2" is deliberately absent from the map below — per-location framing is
// weakest exactly where it's least true, so that bucket shows the flat price
// only (see OnboardingWizard.tsx step 4).
export function perLocationMonthlyDollars(locationCount: number): number {
  return Math.round(ANNUAL_PRICE_CENTS / 12 / locationCount / 100);
}

const LOCATION_BUCKET_UPPER_BOUND: Partial<Record<string, number>> = {
  "3-5": 5,
  "6-10": 10,
  "11-15": 15,
  "16+": 16,
};

export function perLocationMonthlyDollarsForBucket(bucket: string): number | null {
  const n = LOCATION_BUCKET_UPPER_BOUND[bucket];
  return n ? perLocationMonthlyDollars(n) : null;
}

export type LocationBucket = (typeof LOCATION_BUCKETS)[number]["value"];
export type FollowerBand = (typeof FOLLOWER_BANDS)[number]["value"];
export type HiringFrequency = (typeof HIRING_FREQUENCIES)[number]["value"];

/** Legacy predicate — the pre-redesign "0 locations" bucket redirected to Lead
 *  capture instead of checkout. New LOCATION_BUCKETS values never satisfy
 *  this; kept for reading/labeling historical Operator rows only. */
export function isNonOperator(locationsBucket: string): boolean {
  return locationsBucket === "0";
}

/** Legacy predicate — the pre-redesign "15+" bucket redirected to Lead
 *  capture instead of checkout. New LOCATION_BUCKETS values never satisfy
 *  this; kept for reading/labeling historical Operator rows only. */
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
