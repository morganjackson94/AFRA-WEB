# AFRA Claims — canonical source of truth

Every customer-facing claim (landing page, wizard, checkout, dashboard, legal docs, ad creative) must
match this table word-for-word or be a faithful shortening. Nothing may contradict it. **Update this
file first** when a claim needs to change — then propagate to the surfaces below, not the other way
around. Approved as of the July 2026 claims-audit pass (Phase 1 report + Phase 2 sign-off).

## Canonical claims

| Claim | Approved wording | Notes |
|---|---|---|
| Price | $1,990 | Flat, one payment, covers all locations, first year |
| Monthly equivalent | about $166/month | Framing only — billing is annual, one charge |
| Renewal | $4,788/yr (frames as $399/mo) then-current; founding operators pay $3,591/yr (25% off) | 25% standing discount off then-current pricing, conditional on continuous subscription — a permanent benefit, not a price freeze, and not carried over if you cancel and later resubscribe. See `content/legal/terms.md` §7(a). Replaces the previously published $2,388/yr and the earlier unspecified "standing discount" wording. |
| Cohort size | 10 founding operators | Enforced server-side — `countActiveFoundingOperators()` (`src/lib/activation.ts`) blocks checkout at the cap (`src/app/onboarding/actions.ts`) and drives the live landing-page counter (`src/app/page.tsx`) |
| Deadline | July 31, 2026 | Consistent everywhere |
| Guarantee | 30-day money-back, full refund, no questions | Paid from day one. `content/legal/terms.md` §6. |
| Time to live | Setup takes about a minute. You're live within 7 days. | See "7-day promise" below |
| 7-day promise | If you're not live within 7 days, you don't pay | Backed by the 30-day money-back guarantee (§6) — missing the 7-day SLA is, on its own, sufficient grounds for a full refund. There is no separate deferred-payment mechanism; Stripe charges the full amount at checkout, same as always. |
| Core outcome | Candidates are screened against your criteria, then book straight into your calendar | AFRA never books an interview itself — no calendar integration exists (confirmed in the Phase 1 audit: `UnbuiltCalendarProvider` throws, the live ManyChat flow has no scheduling node). The candidate books, using the operator's own booking link — required at onboarding step 7 specifically so this claim is true for every founding operator. |
| Screening capability | Candidates are screened against the operator's own criteria before reaching them. Do not claim scoring, ranking, grading, or "top candidates." | Knockout qualification is automated and operator-specific (`evaluateDisqualification`, `src/lib/screeningQuestions.ts`); competency answers are stored as raw free text and read manually. No AI grading exists in this repo. |
| Proof | sandoitchi, Dallas — 58 candidates in 3 days from one story post, zero ad spend | Raw pilot figure — never describe these as "qualified," never render 58 as a percentage. See sourcing note below. |

## Proof stat — sourcing note (not customer-facing)

- **Location:** sandoitchi, Dallas, TX — one location.
- **Figure:** 58 candidates, 3 days, sourced from a single Instagram story post, zero paid ad spend.
- **Measurement:** as reported to the implementer during the claims-audit brief (July 2026). No independent
  date range or raw data export was available at the time this file was written — if a more precise
  date range or backing data becomes available, add it here rather than in any customer-facing copy.
- Implemented in `src/components/HeroLineBand.tsx`'s `PROOF` constant — that component's own comment
  repeats the "do not fabricate or alter these numbers" rule.

## ToS backing

Every marketing claim with a real commitment behind it has a corresponding Terms of Service clause:

| Claim | ToS clause |
|---|---|
| 30-day money-back guarantee | §6 |
| 7-day live promise | §6 (second paragraph — backed by the money-back guarantee) |
| Renewal price ($4,788/yr) + 25% standing discount ($3,591/yr), conditional on continuity | §7(a) |
| 30 days' notice before any price change | §7(a) |

If a future marketing claim doesn't have a corresponding clause here, that's a flag to add one before
shipping the claim — not to ship the claim without one.

## Out of scope for this file

- Canva ad creative — updated separately; match its wording to this table, not the reverse.
- Pricing strategy itself (the $4,788 renewal price, the 25% founding-operator discount, and the cohort
  size of 10) — decided, not open for revisiting here.
