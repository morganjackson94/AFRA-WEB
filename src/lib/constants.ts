// Shared app-wide defaults. Kept in one place so the seed, provisioning, and
// later real-onboarding code never drift on these values.

// Operator-facing contact address (footer "Contact us" link, marketing +
// dashboard). One source so both footers can't drift out of sync.
export const CONTACT_EMAIL = "morgan@afravisibility.com";

/**
 * Every email captured from a form must pass through this before it's stored
 * or looked up. Operator.email has no case-insensitive constraint in Prisma's
 * schema (a raw SQL unique index on lower(email) is the DB-level backstop —
 * see the migration), so an un-normalized write desyncs storage from lookup.
 * Root cause of a real bug: onboarding never lowercased, login always did —
 * a mobile keyboard auto-capitalizing the first letter of an email field (the
 * default behavior on iOS/Android) silently locked that operator out of
 * magic-link login with no error anywhere.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

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
