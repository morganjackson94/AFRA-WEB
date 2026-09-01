# Database — read this before running anything locally

## Current arrangement (as of 2026-09-01)

Production and dev are **separate Prisma Postgres resources**:

- **Production**: `prisma-postgres-byzantium-helmet`. `DATABASE_URL` /
  `POSTGRES_URL` / `PRISMA_DATABASE_URL` / `DIRECT_URL` are set in Vercel's
  **Production** environment only, and in this repo's `.env` (used by
  anything that intentionally needs production, e.g. one-off ops scripts run
  with an explicit override — nothing should read `.env`'s `DATABASE_URL`
  implicitly, see the guard below).
- **Dev**: `afra-web-dev`, a second Prisma Postgres resource. Wired to
  Vercel's **Preview** environment, and to local dev via `.env.local`'s
  `DEV_DATABASE_URL` (and `DATABASE_URL`/etc., for Next's own env loading).
  Schema kept in sync with production via the same `prisma/migrations/`
  history (`prisma migrate deploy`/`reset` — **not** `prisma db push`, which
  only diffs `schema.prisma` and silently skips raw-SQL migrations like the
  case-insensitive email index; this was caught empirically when
  `email-normalization-smoke.ts` failed against a `db push`-only dev copy).

Verified end-to-end: a real Vercel Preview deployment's onboarding wizard run
was confirmed to land in `afra-web-dev`, not production, by querying both
databases directly after the run.

**Why this exists.** The two databases used to be one — `DATABASE_URL` (and
friends) were set identically for Vercel's **Production and Preview**
environments, with no separate dev database at all. That meant three things
wrote to the same real rows: local `npm run dev`, every one of the
`scripts/*.ts` smoke scripts, and, critically, **every Vercel Preview
deployment** — PR branches and other non-production builds, not just local
dev. Preview lacked `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, so it already
failed closed on billing, but `provision()` doesn't touch Stripe — a Preview
deploy could and did write real Operator/Location/Role rows automatically on
push, with nobody deciding to run anything. That's the sharper half of the
problem this doc originally under-stated: it isn't just "local scripts might
write to prod," it's "pushing a branch might write to prod."

## The guard: `DEV_DATABASE_URL`, no silent fallback

Every local script (`scripts/*.ts`, `prisma/seed.ts`) and the dev-server
Prisma client (`src/lib/prisma.ts`, off Vercel — detected via the
Vercel-injected `VERCEL` env var, absent for plain `npm run dev`) require an
explicit `DEV_DATABASE_URL`. There is **no fallback** to `DATABASE_URL` — the
silent fallback is exactly how a prior session spent hours writing to
production without anyone noticing. See `scripts/lib/guardDatabase.ts`;
scripts call `requireDevDatabase()` instead of constructing their own
`PrismaClient`.

A second, independent check backs this up: a `ProductionMarker` table
(`prisma/schema.prisma`) holds exactly one row, inserted manually into the
real production database only — never via `seed.ts`, never via app code,
never via a migration. `requireDevDatabase()` refuses to run against any
database carrying that row, regardless of which URL it was given. This
matters because a host-string check alone isn't reliable here: production's
Prisma Postgres resource and `afra-web-dev` both live on `db.prisma.io`,
distinguished only by credentials in the connection string, not by host —
so a `DEV_DATABASE_URL` accidentally set to a production-shaped value later
would still be caught.

Verified against all three cases: unset `DEV_DATABASE_URL` refuses,
`DEV_DATABASE_URL` pointed at production refuses (marker row detected),
`DEV_DATABASE_URL` pointed at `afra-web-dev` runs normally. All 16
database-touching `scripts/*.ts` smoke scripts re-verified passing against
the rebuilt dev database.

**Setting up a fresh dev database needs no seed data.**
`ensureSystemDefaultTemplate()` (`src/lib/templates.ts`) self-creates the one
piece of reference data (the system-default `ScreeningTemplate`) the first
time `provision()` runs. Just get the schema right: `prisma migrate deploy`
(or `migrate reset` on an already-populated dev DB you're fine wiping) against
`DEV_DATABASE_URL`/`DIRECT_URL` — never `db push`, per the raw-SQL-migration
gap above.

## Migrations run automatically on every deploy — and once reached production unexpectedly

`package.json`'s `vercel-build` script is `prisma migrate deploy && next
build`. Vercel runs `vercel-build` instead of `build` whenever it's present,
so **every deploy — Production or Preview, git-triggered or an ad-hoc local
`vercel deploy` — applies pending migrations automatically before building.**
Nobody runs `prisma migrate deploy` by hand against a live deployment target;
the build does it. Any future additive migration ships the moment its commit
is deployed, to whichever environment that deployment targets. This is
deliberate and fine for Production. Treat it as load-bearing: a migration
that isn't safe to auto-apply the instant it's deployed isn't safe to merge.

**Unresolved gap, found 2026-09-01:** during this session's funnel-attribution
work, an ad-hoc `vercel deploy` (uncommitted local files, no git push
involved) — confirmed via `vercel inspect` as `target: preview` — had its
`prisma migrate deploy` step apply the migration to **production**, not the
dev database Preview's own env vars (`vercel env ls preview`) correctly
point to. Build logs only show the shared `db.prisma.io` hostname, not which
credential resolved, so the exact mechanism is not confirmed. What's
directly verified and NOT in question: application *data* writes from that
same Preview deployment correctly landed in `afra-web-dev` (checked by
querying both databases directly). What's unresolved: whether the automatic
migration step during a Preview build can be trusted to use Preview's
credentials rather than production's. Until this is root-caused, treat every
schema migration as potentially live on production the moment it's
committed, regardless of which environment you think you're deploying to —
the `ProductionMarker` guard protects data writes from app code and scripts,
but does **not** protect the migration step itself, which runs before any
app code executes.

## Live Stripe restricted key — read-only by design (and that's fine)

The Stripe CLI's live-mode restricted key (`rk_live_...DO3w`, on the "Afra
Visibility" account) cannot perform ANY of the following — confirmed by
hitting `more_permissions_required` on each one across two sessions:

- `product_write` (create/update/archive products)
- `subscription_write` (cancel/update subscriptions, e.g. `trial_end=now`)
- `webhook_write` (update a webhook endpoint's subscribed events)
- `checkout_session_write` (expire a checkout session)
- `customer_write` (delete a customer)

Reads (`retrieve`, `list`) on all of these work fine with the same key.

**This turned out to be a useful safety property, not a defect to fix.** It
means no local script, CLI command, or agent session can silently mutate real
live-mode billing state — every live-mode write across two sessions required
a human to do it manually in the Stripe Dashboard, which is exactly the kind
of friction you want on "cancel a real subscription" or "archive a real
product." Don't request broader permissions on this key to make CLI workflows
more convenient; the inconvenience is load-bearing. Test-mode operations
(same commands without `--live`) are unaffected — they use a separate, fully
permissioned key.
