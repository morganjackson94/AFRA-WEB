// Jurisdiction restriction — automated hiring/AEDT-style laws (NYC Local Law
// 144, Illinois HB 3773, Colorado's Consumer Protections in AI Act). AFRA has
// none of the compliance infrastructure these require yet (bias audits,
// advance candidate notice), so until that's built, operators with ANY
// location in a restricted jurisdiction are soft-blocked at signup — full
// block, not partial-serve. See docs/partial-serve-design.md for why partial
// enforcement was rejected and what triggers building it for real.
//
// This is a HARD gate (like TOS consent), not a soft signal (like reachFlag
// in qualification.ts) — a restricted operator must not be able to reach
// checkout, including by tampering with the client. Always call
// isRestrictedJurisdiction() server-side; never trust a client-only check.
//
// Data, not conditionals, because this list WILL grow — more states have
// AEDT bills pending.

export type RestrictedJurisdiction = {
  /** Two-letter US state code this restriction is keyed on. */
  state: string;
  /** Human label used in messaging and Lead records. */
  label: string;
  /** The law driving the restriction (internal reference, not shown verbatim to operators). */
  law: string;
  /** If set, the restriction only applies within this city inside the state
   *  (resolved via the operator's own "is it in NYC" answer) — omit for a
   *  state-wide restriction. */
  cityScoped?: string;
};

export const RESTRICTED_JURISDICTIONS: RestrictedJurisdiction[] = [
  { state: "NY", label: "New York City", law: "NYC Local Law 144", cityScoped: "New York City" },
  { state: "IL", label: "Illinois", law: "Illinois HB 3773" },
  { state: "CO", label: "Colorado", law: "Colorado Consumer Protections in AI Act" },
];

/** Every restricted jurisdiction the operator's answers actually match — the
 *  detail stored on the Lead record so a future partial-serve pass knows
 *  exactly which location(s)/law(s) were the blocker, not just "restricted". */
export function matchedRestrictedJurisdictions(
  states: string[],
  hasNycLocation: boolean,
): RestrictedJurisdiction[] {
  return RESTRICTED_JURISDICTIONS.filter((r) => {
    if (!states.includes(r.state)) return false;
    if (r.cityScoped) return hasNycLocation;
    return true;
  });
}

/** ANY matching restricted jurisdiction blocks the WHOLE signup — full
 *  soft-block, not partial-serve. Decision locked; see docs/partial-serve-design.md
 *  before revisiting. */
export function isRestrictedJurisdiction(states: string[], hasNycLocation: boolean): boolean {
  return matchedRestrictedJurisdictions(states, hasNycLocation).length > 0;
}
