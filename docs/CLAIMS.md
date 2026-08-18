# AFRA Claims — canonical source of truth

Every customer-facing claim (landing page, wizard, checkout, dashboard, legal docs, ad creative,
transactional email) must match this table word-for-word or be a faithful shortening. Nothing may
contradict it. **Update this file first** when a claim needs to change — then propagate to the surfaces
below, not the other way around. Approved as of the July 2026 claims-audit pass (Phase 1 report + Phase
2 sign-off). **Repriced August 2026**: the founding cohort deadline (July 31, 2026) passed with zero
sales — this is a repricing, not an offer extension. AFRA now has one standing price; there is no
founding tier, no scarcity narrative, and no deadline anywhere in customer-facing copy.

## Canonical claims

| Claim | Approved wording | Notes |
|---|---|---|
| Price | $4,788/year | Flat, one payment, covers all locations. Standard, ongoing pricing — not an introductory or limited-time rate. |
| Monthly equivalent | about $399/month | Framing only — billing is annual, one charge |
| Structural pricing advantage (landing page) | "One flat rate — no per-location fees, no per-seat charges. Most platforms charge per location; AFRA doesn't." | Static, location-agnostic — the landing page doesn't know an operator's location count yet. Describes the flat-vs-per-location *structure*, never a fabricated savings dollar amount or a named-competitor comparison. |
| Per-location reflection (wizard, post location-count) | "Across your {bucket} locations, that's as low as ~${X}/location/month" | Personalized, decided 2026-08-01. `X` = `perLocationMonthlyDollars()` in `src/lib/qualification.ts`, computed off each location bucket's *upper* bound (honest floor — the true per-location cost for anyone in that bucket is at or below `X`). Suppressed entirely for the 1-2 location bucket, where the framing is weakest. Never fired on the landing page (no location count known there) — wizard step 4 only. |
| Renewal | Same price, renews annually | No discount, no locked/grandfathered rate — there is only one price. 30 days' written notice before any future price change (standard practice, not tied to any offer). See `content/legal/terms.md` §7(a). |
| Guarantee | 30-day money-back, full refund, no questions | Paid from day one. `content/legal/terms.md` §6. |
| Time to live | Setup takes about a minute. You're live within 7 days. | See "7-day promise" below |
| 7-day promise | If you're not live within 7 days, you don't pay | Backed by the 30-day money-back guarantee (§6) — missing the 7-day SLA is, on its own, sufficient grounds for a full refund. There is no separate deferred-payment mechanism; Stripe charges the full amount at checkout, same as always. |
| Core outcome | Candidates are screened against your criteria, then book straight into your calendar | AFRA never books an interview itself — no calendar integration exists (confirmed in the Phase 1 audit: `UnbuiltCalendarProvider` throws, the live ManyChat flow has no scheduling node). The candidate books, using the operator's own booking link — required at onboarding step 7 specifically so this claim is true for every operator. |
| Screening capability | Candidates are screened against the operator's own criteria before reaching them. Do not claim scoring, ranking, grading, or "top candidates." | Knockout qualification is automated and operator-specific (`evaluateDisqualification`, `src/lib/screeningQuestions.ts`); competency answers are stored as raw free text and read manually. No AI grading exists in this repo. |
| Proof | sandoitchi, Dallas — 58 candidates in 3 days from one story post, zero ad spend | Raw pilot figure — never describe these as "qualified," never render 58 as a percentage. See sourcing note below. |

## Retired claims (do not resurrect without a new pricing decision)

As of the August 2026 repricing, the following are **no longer claims** — they described the founding
cohort offer, which has ended:

- "$1,990 first year" / any two-tier price
- "10 founding operators" / "first 10 only" / any spot count
- "July 31, 2026" / any deadline
- "25% standing discount" / "founding rate locked" / any grandfathered renewal price
- "Founding Operator" as a customer-facing label or identity (dashboard, welcome page, confirmation
  email) — operators are simply AFRA customers now, no cohort badge

The seat-cap mechanism itself (`FOUNDING_SPOTS_TOTAL`, `countActiveFoundingOperators()` in
`src/lib/activation.ts`, the checkout-time gate in `src/app/onboarding/actions.ts`) **still exists in
code** as an internal operational safety valve — it is silent now, not a marketing claim, and should
never resurface as customer-facing copy. If it fires, the decline message is generic capacity/waitlist
language, not a founding-cohort reference.

## Proof stat — sourcing note (not customer-facing)

- **Location:** sandoitchi, Dallas, TX — one location.
- **Figure:** 58 candidates, 3 days, sourced from a single Instagram story post, zero paid ad spend.
- **Measurement:** as reported to the implementer during the claims-audit brief (July 2026). No independent
  date range or raw data export was available at the time this file was written — if a more precise
  date range or backing data becomes available, add it here rather than in any customer-facing copy.
- Implemented in `src/components/HeroLineBand.tsx`'s `PROOF` constant — that component's own comment
  repeats the "do not fabricate or alter these numbers" rule.

## Lifecycle emails

Three transactional emails, all in `src/lib/mail.ts`, all Resend-with-console-stub (same seam as every
other outbound email), all carrying a magic-link straight into the dashboard (reuses
`createLoginToken()` from `src/lib/auth.ts`, the same token issuance `sendReadyToConnectEmail` uses).
None claim auto-renewal or autonomous follow-up — see Renewal above. If the price, guarantee, or renewal
wording in this file changes, all three must be updated in the same pass.

Superseded: `sendFoundingPurchaseConfirmationEmail()` (single variant, founding-era) was replaced
outright by the welcome email below — it sent exactly the moment the welcome email now sends, so running
both would double-send. The function and its backing field (`Operator.purchaseConfirmationEmailSentAt`)
were removed from the send path; the DB column stays (additive-only migration policy) but is no longer
written.

**Welcome** — `sendWelcomeAssignedEmail()` / `sendWelcomeAwaitingSetupEmail()`, sent from
`confirmFoundingPayment()` (`src/lib/activation.ts`) on the verified-webhook path, after ManyChat pool
assignment resolves. Variant depends on whether a flow was assigned (pool had stock) or not (awaiting
setup, mirrors the dashboard's own awaiting-setup banner). Idempotent via `welcomeEmailSentAt`.

**You're live** — `sendYoureLiveEmail()` / `sendYoureLiveLowReachEmail()`, sent from `connectChannel()`
(`src/lib/activation.ts`) on the channel's first genuine transition to `"connected"` — fires from the
shared orchestrator, not any one caller, so it fires identically regardless of which path triggers the
connect. Low-reach variant (`Operator.reachFlag`, see `src/lib/qualification.ts`) adds the three real,
already-live traffic mechanics (dashboard QR code, bio link, keyword-on-every-post) plus a concierge
offer — `reachFlag` stays concierge-only context, never a rejection. Idempotent via `liveEmailSentAt`.

**Day-20 check-in** — `sendCheckinEmail()`, sent by the `/api/jobs/run-scheduled-emails` job (Vercel
Cron, daily) for every operator whose `checkinEmailDueAt` (set at payment confirmation, payment date +
20 days) has passed and who hasn't received it yet. Filtered to `billingStatus: "active"` to skip
refunded/canceled operators — there's no automated refund webhook, so this depends on `billingStatus`
being flipped by hand on a manual refund. Idempotent via `checkinEmailSentAt`.

All three repeat the guarantee/refund terms verbatim from this file where they mention it. Approved
final copy — see git history for the exact text; don't paraphrase further without re-checking against
this table.

## ToS backing

Every marketing claim with a real commitment behind it has a corresponding Terms of Service clause:

| Claim | ToS clause |
|---|---|
| 30-day money-back guarantee | §6 |
| 7-day live promise | §6 (second paragraph — backed by the money-back guarantee) |
| $4,788/yr flat, renews at the same rate | §5(a), §7(a) |
| 30 days' notice before any price change | §7(a) |

If a future marketing claim doesn't have a corresponding clause here, that's a flag to add one before
shipping the claim — not to ship the claim without one.

## Out of scope for this file

- Canva ad creative and Meta campaign primary text — updated separately; match wording to this table,
  not the reverse. **Known stale as of this repricing**: the current carousel decks and campaign copy
  still show the old $1,990 / "10 founding operators" / "closes July 31" framing. Flagged repeatedly
  in the Phase 1/2 reports — fix before any future ad spend.
- Pricing strategy itself (that the standing price is $4,788/yr, and that the founding cohort ended) —
  decided, not open for revisiting here.
