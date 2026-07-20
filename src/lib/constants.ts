// Shared app-wide defaults. Kept in one place so the seed, provisioning, and
// later real-onboarding code never drift on these values.

// Operator-facing contact address (footer "Contact us" link, marketing +
// dashboard). One source so both footers can't drift out of sync.
export const CONTACT_EMAIL = "morgan@afravisibility.com";

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
