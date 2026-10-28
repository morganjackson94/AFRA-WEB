// Option lists shared by the onboarding wizard and the AE intake form
// (src/app/ae/new), so the two can never drift apart. Location buckets,
// follower bands, hiring frequency and states live in qualification.ts.

export const ROLE_TITLES = ["Front of House", "Back of House", "Barista", "Line Cook"] as const;

export const DISQUALIFIERS = [
  { value: "no_weekends", label: "No weekend availability" },
  { value: "no_evenings", label: "No evening availability" },
  { value: "under_6mo_experience", label: "Under 6 months experience" },
  { value: "no_transportation", label: "No reliable transportation" },
  { value: "cant_open", label: "Can't work opening shifts" },
  { value: "cant_close", label: "Can't work closing shifts" },
  { value: "no_food_handler_cert", label: "No food handler cert" },
  { value: "wont_commit_3mo", label: "Won't commit to 3+ months" },
] as const;

export const CALENDAR_CHOICES = [
  { id: "google", label: "Google Calendar" },
  { id: "microsoft", label: "Microsoft 365" },
  { id: "other", label: "Other calendar" },
] as const;

export const CALENDAR_IDS: readonly string[] = CALENDAR_CHOICES.map((c) => c.id);
export const DISQUALIFIER_VALUES: readonly string[] = DISQUALIFIERS.map((d) => d.value);
