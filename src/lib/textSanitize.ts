// Sanity/profanity check for the step-3 "Other" role free text in the
// Onboarding Wizard — the only free-text input anywhere in the wizard that
// becomes a candidate-facing label (rendered on a fixed-width pill/button in
// ManyChat and the dashboard's role selector), so it needs a hard length cap
// on top of the usual "don't let someone type garbage" check. Deliberately a
// small local blocklist, not a dependency — this is one low-stakes input,
// not a general content-moderation surface.

export const OTHER_ROLE_MAX_LENGTH = 24;

// Minimal, case-insensitive. Extend if abuse shows up in practice — this is
// meant to catch obvious cases, not serve as a comprehensive filter.
const BLOCKED_WORDS = ["fuck", "shit", "cunt", "nigger", "faggot", "retard"];

export type TextValidationResult = { ok: true; value: string } | { ok: false; error: string };

/** Validate + normalize the "Other" role free text. Trims, rejects
 *  empty-after-trim, enforces OTHER_ROLE_MAX_LENGTH, and blocks obvious
 *  profanity. Never throws — always returns a discriminated result so the
 *  wizard can show an inline error instead of a crash. */
export function validateOtherRoleText(input: string): TextValidationResult {
  const value = input.trim().replace(/\s+/g, " ");

  if (!value) return { ok: false, error: "Enter the role you're hiring for." };
  if (value.length > OTHER_ROLE_MAX_LENGTH) {
    return { ok: false, error: `Keep it under ${OTHER_ROLE_MAX_LENGTH} characters.` };
  }

  const lower = value.toLowerCase();
  if (BLOCKED_WORDS.some((word) => lower.includes(word))) {
    return { ok: false, error: "That doesn't look like a role title." };
  }

  return { ok: true, value };
}
