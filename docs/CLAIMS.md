# AFRA Claims — canonical source of truth

Every customer-facing claim (landing page, wizard, checkout, dashboard, legal docs, ad creative,
transactional email) must match this table word-for-word or be a faithful shortening. Nothing may
contradict it. **Update this file first** when a claim needs to change — then propagate to the surfaces
below, not the other way around. Approved as of the July 2026 claims-audit pass (Phase 1 report + Phase
2 sign-off). **Repriced in August 2026**: the one-time $4,788/yr annual charge (itself an earlier August 2026
repricing) was replaced with a real $399/mo subscription and a genuine free trial — the upfront-cost
objection was the single most consistent piece of prospect feedback, and a subscription is what makes a
trial possible at all (a one-time charge has nothing to "trial"). **Repriced again, September 2026**: the
$399/mo subscription's interval changed to annual — $4,788/yr, recurring (not the one-time charge this
file previously banned; see the reversed retired-claims entry below). Reasoning: CAC-payback economics on
a monthly commitment didn't work; a subscription (any interval) is still what makes the trial mechanism
possible, so the trial terms (`FREE_CANDIDATE_CAP`/`TRIAL_DAYS_BACKSTOP`) are completely unchanged by this
pass. There are no paying customers on the monthly interval at the time of this change, so this is a
clean cutover, not a migration.

## Canonical claims

| Claim | Approved wording | Notes |
|---|---|---|
| Price | $4,788/year — about $399/month — every location included | Flat, recurring, covers all locations. Standard, ongoing pricing — not an introductory or limited-time rate. The monthly figure is kept as an anchor alongside the real (annual) price and interval — never state the monthly figure alone, since that's not what the card is actually charged. |
| The trial | Your first 20 screened candidates are free, for up to 60 days | Whichever comes first. A card is required to start (Stripe's default for subscription-mode Checkout), but nothing is charged until the trial ends. `FREE_CANDIDATE_CAP` / `TRIAL_DAYS_BACKSTOP` in `src/lib/billing.ts` — unchanged by the September 2026 interval change; the trial mechanism doesn't depend on the subscription's interval. "Screened" means passed your screening (`Candidate.stage` reaching `"screened"` or beyond) — a candidate who doesn't pass never counts against the free 20. |
| Cancel anytime | You can cancel any time. During the trial, nothing is owed. After the trial, canceling stops the next renewal but does not end early or refund the year already paid for — you keep access through the end of that year. | Self-serve, from the dashboard (`cancelSubscriptionAction`) — a real Stripe cancellation, not a support-ticket process. The "stop paying immediately" reading was accurate under the monthly interval; it is NOT accurate under annual and must not be implied. See `content/legal/terms.md` §7(c), rewritten September 2026 to state this explicitly with a worked example (canceling in month three of a paid year). |
| Structural pricing advantage (landing page) | "One flat rate: no per-location fees, no per-seat charges. Most platforms charge per location; AFRA doesn't." | Punctuation updated in the August 2026 redesign pass (em-dash removed site-wide from customer-facing copy; substance unchanged). Static, location-agnostic — the landing page doesn't know an operator's location count yet. Describes the flat-vs-per-location *structure*, never a fabricated savings dollar amount or a named-competitor comparison. |
| Per-location reflection (wizard, post location-count) | "Across your {bucket} locations, that's as low as ~${X}/location/month" | Personalized, decided 2026-08-01. `X` = `perLocationMonthlyDollars()` in `src/lib/qualification.ts`, which as of the September 2026 annual repricing divides `ANNUAL_PRICE_CENTS` by 12 *before* dividing by location count — this stays a MONTHLY-equivalent per-location figure even though the underlying price is annual (do not remove the /12; that's the exact bug this note exists to prevent). Computed off each location bucket's *upper* bound (honest floor — the true per-location cost for anyone in that bucket is at or below `X`). Suppressed entirely for the 1-2 location bucket, where the framing is weakest. Never fired on the landing page (no location count known there) — wizard step 4 only. |
| Renewal | Recurring annual subscription, billed to the card on file until canceled | Standard subscription renewal — no separate renewal conversation. Retired: the old one-time-charge "we'll reach out before your year is up" language and its backing TODO in `billing.ts` — a subscription (annual or otherwise) is the renewal mechanism, Stripe renews it natively. See `content/legal/terms.md` §7. |
| Time to live | Setup takes about a minute. You're live within 7 days. | See "7-day promise" below |
| 7-day promise | If you're not live within 7 days, we'll help you get there | No longer backed by a money-back guarantee (retired below) — the trial itself is the risk reversal, since nothing has been charged during it regardless of the 7-day timeline. Do not restore "or you don't pay" wording; it implied a guarantee mechanism that no longer exists. |
| Core outcome | Candidates are screened against your criteria, then book straight into your calendar | AFRA never books an interview itself — no calendar integration exists (confirmed in the Phase 1 audit: `UnbuiltCalendarProvider` throws, the live ManyChat flow has no scheduling node). The candidate books, using the operator's own booking link — required at onboarding step 7 specifically so this claim is true for every operator. |
| Screening capability | Candidates are screened against the operator's own criteria before reaching them. Do not claim scoring, ranking, grading, or "top candidates." | Knockout qualification is automated and operator-specific (`evaluateDisqualification`, `src/lib/screeningQuestions.ts`); competency answers are stored as raw free text and read manually. No AI grading exists in this repo. |
| Proof | sandoitchi, Dallas — 58 candidates in 3 days from one story post, zero ad spend | Raw pilot figure — never describe these as "qualified," never render 58 as a percentage. See sourcing note below. |

## Retired claims (do not resurrect without a new pricing decision)

**September 2026 update — reversing a prior entry, not silently editing it:** the August 2026 version of
this file banned annual framing outright ("the price is a recurring $399/month"). That guardrail was
correct for what it was written to prevent at the time — the *one-time* $4,788/yr charge, which had no
trial mechanism. It does not apply to what exists now: a genuinely *recurring* $4,788/yr subscription,
which supports the trial exactly the same way the $399/mo subscription did. The line below is struck
through and replaced, not deleted, so the next person reading this sees a decision, not drift.

- ~~"$4,788/year" / "billed once" / "per year" / any annual framing — the price is a recurring
  $399/month~~ **Reversed, September 2026.** The price is now $4,788/year, recurring — annual framing is
  the current, correct claim (see canonical claims table above). What remains genuinely retired: "billed
  once" and any language implying a one-time, non-renewing charge — that was true of the pre-August-2026
  model and has never been true of either subscription version since.
- Stating the monthly figure ($399/mo) *alone*, without the real annual price and interval — the anchor
  framing ("$4,788/year — about $399/month") is required precisely so nobody reads the monthly number as
  what their card is actually charged.
- "30-day money-back guarantee" / "paid from day one" — structurally incompatible with an unpaid trial
  (you cannot refund a charge that was never made); the trial itself is the risk reversal now
- "we'll reach out before your year is up" / any renewal-notice-call framing — a subscription renews
  itself; there is no annual renewal conversation to have
- "$1,990 first year" / any two-tier price, "10 founding operators" / "first 10 only" / any spot count,
  "July 31, 2026" / any deadline, "25% standing discount" / "founding rate locked" / any grandfathered
  renewal price (all pre-date the August 2026 repricing, still retired)
- "Founding Operator" as a customer-facing label or identity (dashboard, welcome page, confirmation
  email) — operators are simply AFRA customers now, no cohort badge

The seat-cap mechanism itself (`FOUNDING_SPOTS_TOTAL`, `countActiveFoundingOperators()` in
`src/lib/activation.ts`, the checkout-time gate in `src/app/onboarding/actions.ts`) **still exists in
code** as an internal operational safety valve — it is silent now, not a marketing claim, and should
never resurface as customer-facing copy. If it fires, the decline message is generic capacity/waitlist
language, not a founding-cohort reference. Likewise `createFoundingCheckout`/`startFoundingCheckout`/
`confirmFoundingPayment`/`plan: "founding_annual"` remain pre-existing internal identifiers, unchanged —
not customer-facing, not renamed as part of this repricing (same precedent as the August 2026 pass).

## Proof stat — sourcing note (not customer-facing)

- **Location:** sandoitchi, Dallas, TX — one location.
- **Figure:** 58 candidates, 3 days, sourced from a single Instagram story post, zero paid ad spend.
- **Measurement:** as reported to the implementer during the claims-audit brief (July 2026). No independent
  date range or raw data export was available at the time this file was written — if a more precise
  date range or backing data becomes available, add it here rather than in any customer-facing copy.
- Implemented in `src/components/HeroLineBand.tsx`'s `PROOF` constant — that component's own comment
  repeats the "do not fabricate or alter these numbers" rule.

## Lifecycle emails

Four transactional emails, all in `src/lib/mail.ts`, all Resend-with-console-stub (same seam as every
other outbound email), all carrying a magic-link straight into the dashboard (reuses
`createLoginToken()` from `src/lib/auth.ts`, the same token issuance `sendReadyToConnectEmail` uses).
None claim auto-renewal or autonomous follow-up. If the price, trial, or renewal wording in this file
changes, all four must be updated in the same pass.

Superseded: `sendFoundingPurchaseConfirmationEmail()` (single variant, one-time-charge era) was replaced
outright by the welcome email below — it sent exactly the moment the welcome email now sends, so running
both would double-send. The function and its backing field (`Operator.purchaseConfirmationEmailSentAt`)
were removed from the send path; the DB column stays (additive-only migration policy) but is no longer
written.

**Welcome** — `sendWelcomeAssignedEmail()` / `sendWelcomeAwaitingSetupEmail()`, sent from
`confirmFoundingPayment()` (`src/lib/activation.ts`) on the verified-webhook path (`checkout.session.
completed`), after ManyChat pool assignment resolves. States the trial terms (20 free screened
candidates, 60-day cap), NOT a charge confirmation — nothing is charged at this point. Variant depends
on whether a flow was assigned (pool had stock) or not (awaiting setup, mirrors the dashboard's own
awaiting-setup banner). Idempotent via `welcomeEmailSentAt`.

**You're live** — `sendYoureLiveEmail()` / `sendYoureLiveLowReachEmail()`, sent from `connectChannel()`
(`src/lib/activation.ts`) on the channel's first genuine transition to `"connected"` — fires from the
shared orchestrator, not any one caller, so it fires identically regardless of which path triggers the
connect. Low-reach variant (`Operator.reachFlag`, see `src/lib/qualification.ts`) adds the three real,
already-live traffic mechanics (dashboard QR code, bio link, keyword-on-every-post) plus a concierge
offer — `reachFlag` stays concierge-only context, never a rejection. Idempotent via `liveEmailSentAt`.

**Day-20 check-in** — `sendCheckinEmail()`, sent by the `/api/jobs/run-scheduled-emails` job (Vercel
Cron, daily) for every operator whose `checkinEmailDueAt` (set at checkout confirmation, confirmation
date + 20 days) has passed and who hasn't received it yet. Filtered to `billingStatus` in `("trialing",
"active")` — day 20 lands almost always mid-trial under the trial model (it runs up to 60 days), so
"trialing" must be included, not just "active." Idempotent via `checkinEmailSentAt`.

**Trial ended** (new) — `sendTrialEndedEmail()`, sent by `applyStripeStatus()` (`src/lib/activation.ts`)
the moment an operator's subscription leaves `"trialing"` — the single shared reconciliation point for
BOTH ways a trial can end (crossing the candidate cap early, via `endTrialForCandidateCap`, or Stripe's
own 60-day backstop, `trial_period_days` on the subscription — no app code triggers that one). States
plainly that billing has started at $4,788/year (about $399/month); never a surprise. Idempotent via
`trialEndedEmailSentAt`.

**Trial ending soon** (drafted, NOT YET WIRED as of September 2026 — see the annual-repricing work log)
— planned as `sendTrialEndingSoonEmail()`, to be sent by `/api/jobs/run-scheduled-emails` 7 days before
the trial's backstop date. Motivation: Stripe's own `customer.subscription.trial_will_end` webhook fires
a fixed 3 days before trial end, inadequate notice for a $4,788 charge (chargeback risk), and isn't
configurable to fire earlier. Copy drafted and pending approval before this is wired into schema/code —
do not treat this entry as describing shipped behavior until this note is updated to remove this
caveat.

All four repeat the trial/pricing terms verbatim from this file where they mention them. Approved
final copy — see git history for the exact text; don't paraphrase further without re-checking against
this table.

## ToS backing

Every marketing claim with a real commitment behind it has a corresponding Terms of Service clause:

| Claim | ToS clause |
|---|---|
| First 20 screened candidates free, 60-day cap | §5 |
| Cancel any time, nothing owed during the trial | §5, §7 |
| $4,788/year, recurring until canceled | §5, §7 |
| Self-serve cancellation; canceling after the trial keeps access through the paid year | §7(c) |

If a future marketing claim doesn't have a corresponding clause here, that's a flag to add one before
shipping the claim — not to ship the claim without one.

## Out of scope for this file

- Canva ad creative and Meta campaign primary text — updated separately; match wording to this table,
  not the reverse. **Known stale, and now confusing rather than just outdated**: the current carousel
  decks and campaign copy show "$4,788/yr" from the pre-August-2026 one-time-charge era — that dollar
  figure now happens to match the current price again (September 2026 repricing), but the *mechanism* in
  that old ad copy (one-time charge, "paid from day one," no trial) does not match what's actually sold
  today (recurring annual subscription, 20-candidate/60-day free trial). Do not assume old "$4,788/yr" ad
  material is safe to reuse just because the number matches — check the surrounding claims, not just the
  price. Older material ($1,990/"10 founding operators") is stale on both the number and the mechanism.
  Fix before any future ad spend — an ad promising terms that don't match the page is the exact failure
  mode this file exists to prevent.
- Pricing strategy itself (that the standing price is $4,788/year, framed with the $399/month anchor,
  with a 20-candidate/60-day trial) — decided, not open for revisiting here.
- The Meta trial→paid conversion pixel event (the real revenue signal, as opposed to `StartTrial` at
  signup) is a deliberately descoped fast-follow — see the doc comment on `getCheckoutSessionAmount` in
  `src/lib/billing.ts` for why and what the eventual fix looks like.
