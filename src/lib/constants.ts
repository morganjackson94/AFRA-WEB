// Shared provisioning defaults. Kept in one place so the seed, provisioning,
// and later real-onboarding code never drift on these values.

export const DEFAULT_TIMEZONE = "America/Chicago";

// A standard week of business hours. [open, close] windows per weekday.
export const DEFAULT_BUSINESS_HOURS = {
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [["10:00", "16:00"]],
  sun: [] as string[][],
};
