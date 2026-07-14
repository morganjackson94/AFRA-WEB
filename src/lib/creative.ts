// Compliance guard for operator-editable hiring-post text. Editable text means
// an operator can type something that trips Meta's employment / Special Ad
// Category rules (age, protected classes, discriminatory eligibility). This is
// the single, auditable place those rules live.
//
// IMPORTANT: this is a first-pass keyword/pattern guard. It reduces obvious risk;
// it does NOT certify compliance and is NOT a substitute for the legal/employment
// review (tracked separately in Part B ④). The rule list is informed by that
// review and should be extended as it progresses.

export type Violation = {
  /** Which slot tripped the rule (e.g. "headline"). */
  field: string;
  /** Rule category for auditing/aggregation. */
  category:
    | "age"
    | "gender"
    | "race_ethnicity_origin"
    | "religion"
    | "disability"
    | "family_status"
    | "eligibility";
  /** Plain-language explanation shown to the operator. */
  reason: string;
  /** The offending substring that matched. */
  match: string;
};

export type ValidationResult = { ok: boolean; violations: Violation[] };

type Rule = {
  category: Violation["category"];
  pattern: RegExp; // must use the global flag for match collection
  reason: string;
};

// Plain-language reasons are operator-facing — keep them human, not legalese.
const RULES: Rule[] = [
  // --- Age (most common employment-post mistake) ---
  {
    category: "age",
    pattern: /\b(young|youthful|youngster|recent grad(uate)?|new grad|students? only|digital native)\b/gi,
    reason: "This can't mention age — employment posts have to be open to everyone.",
  },
  {
    category: "age",
    pattern: /\b(under|over|younger than|older than)\s+\d{1,2}\b/gi,
    reason: "This can't set an age limit — employment posts have to be open to all ages.",
  },
  {
    category: "age",
    pattern: /\b\d{1,2}\s*[-–]\s*\d{1,2}\s*(years?( old)?|yrs?)\b/gi,
    reason: "This can't set an age range — employment posts have to be open to all ages.",
  },
  // --- Gender ---
  {
    category: "gender",
    pattern: /\b(male|female|man|woman|men|women|ladies|gentlemen|girls?|boys?|waitress|waiter|salesman|saleswoman|busboy)\b/gi,
    reason: "This can't specify or imply gender — the role must be open to all genders.",
  },
  // --- Race / ethnicity / national origin ---
  {
    category: "race_ethnicity_origin",
    pattern: /\b(white|black|asian|hispanic|latino|latina|caucasian|native[-\s]english[-\s]speakers?|english[-\s]only|american[-\s]born)\b/gi,
    reason: "This can't reference race, ethnicity, or national origin — the role must be open to everyone.",
  },
  // --- Religion ---
  {
    category: "religion",
    pattern: /\b(christian|muslim|jewish|catholic|hindu|buddhist|no muslims)\b/gi,
    reason: "This can't reference religion — the role must be open to all beliefs.",
  },
  // --- Disability / health ---
  {
    category: "disability",
    pattern: /\b(able[-\s]bodied|no disabilities|healthy applicants? only|must be in perfect health)\b/gi,
    reason: "This can't reference disability or health — the role must be open to people of all abilities.",
  },
  // --- Family / marital status ---
  {
    category: "family_status",
    pattern: /\b(no kids|no children|childless|single only|married only|must be single)\b/gi,
    reason: "This can't reference family or marital status — the role must be open to everyone.",
  },
  // --- Discriminatory eligibility / identity-based pay ---
  {
    category: "eligibility",
    pattern: /\b(citizens? only|us citizens? only|no immigrants|natural[-\s]born)\b/gi,
    reason: "This can't restrict by citizenship or origin the way it's phrased — keep eligibility open and lawful.",
  },
];

// Slots whose text is operator-editable and must be validated.
const TEXT_SLOTS = ["headline", "roleLabel", "payLabel", "cta"] as const;

/**
 * Validate the editable text slots of a hiring post. Returns ok=false with one
 * or more plain-language violations if any slot trips a rule. The SAME function
 * backs the UI and any server-side save, so a bad string can never persist.
 */
export function validateCreativeText(slots: Record<string, unknown>): ValidationResult {
  const violations: Violation[] = [];

  for (const field of TEXT_SLOTS) {
    const value = slots[field];
    if (typeof value !== "string" || value.trim() === "") continue;

    for (const rule of RULES) {
      // Reset lastIndex since the patterns are global and reused.
      rule.pattern.lastIndex = 0;
      const matches = value.match(rule.pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({ field, category: rule.category, reason: rule.reason, match });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
