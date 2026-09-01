# Database — read this before running anything locally

**Local dev and Vercel Production currently share ONE Postgres database.**
There is no separate dev/staging database. `DATABASE_URL` (and `POSTGRES_URL`,
`PRISMA_DATABASE_URL`, `DIRECT_URL`) live in `.env` (not `.env.local`), and
that same connection string is also set for Vercel's **Preview** environment
(`vercel env ls` — confirmed 2026-09-01). So three things write to the exact
same rows real customers would use:

- `npm run dev` (local Next.js dev server)
- Any of the 16+ `scripts/*.ts` smoke/inventory scripts — they all call
  `new PrismaClient()` against `process.env.DATABASE_URL` directly, with zero
  environment check
- Every Vercel Preview deployment (PR branches, etc.)

**Discovered:** 2026-09-01, during a Stripe webhook/pricing audit. A whole
session's worth of test operators, backdated `createdAt` values, forced
`trialEndingSoonEmailSentAt` timestamps, and Stripe test-clock work all wrote
into this one database. Nothing was damaged only because there were no real
customers yet — this stops being harmless the moment there is one. There is
no error state for "wrong database": a script pointed at the wrong
`DATABASE_URL` just succeeds, silently, against the wrong data.

**Until this is fixed** (see the open proposal from the 2026-09-01 session —
ask for the "separate dev from prod" plan if it hasn't been picked up yet):
treat every local script and every `npm run dev` session as live against
production. Clean up any operator/location/role/etc. rows a script creates.
Never assume "it's just local" means "it's safe to be destructive."

## Live Stripe restricted key — read-only by design (and that's fine)

The Stripe CLI's live-mode restricted key (`rk_live_...DO3w`, on the "Afra
Visibility" account) cannot perform ANY of the following — confirmed by
hitting `more_permissions_required` on each one this session:

- `product_write` (create/update/archive products)
- `subscription_write` (cancel/update subscriptions, e.g. `trial_end=now`)
- `webhook_write` (update a webhook endpoint's subscribed events)
- `checkout_session_write` (expire a checkout session)
- `customer_write` (delete a customer)

Reads (`retrieve`, `list`) on all of these work fine with the same key.

**This turned out to be a useful safety property, not a defect to fix.** It
means no local script, CLI command, or agent session can silently mutate real
live-mode billing state — every live-mode write this session required a
human to do it manually in the Stripe Dashboard, which is exactly the kind of
friction you want on "cancel a real subscription" or "archive a real
product." Don't request broader permissions on this key to make CLI workflows
more convenient; the inconvenience is load-bearing. Test-mode operations
(same commands without `--live`) are unaffected — they use a separate, fully
permissioned key.
