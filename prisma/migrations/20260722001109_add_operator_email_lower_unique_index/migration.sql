-- Backfill: normalize any existing mixed-case emails to lowercase before the
-- constraint below can enforce it. Read-only audit (2026-07-21) found exactly
-- 1 Operator row where email <> LOWER(email), and zero case-insensitive
-- collisions among existing rows in either Operator or OnboardingDraft, so
-- this backfill and the unique index below are both safe to apply as-is.
UPDATE "Operator" SET email = LOWER(email) WHERE email <> LOWER(email);
UPDATE "OnboardingDraft" SET email = LOWER(email) WHERE email <> LOWER(email);

-- DB-level backstop for case-insensitive uniqueness. App code now normalizes
-- every email at the point of write (normalizeEmail(), src/lib/constants.ts)
-- before it ever reaches Operator.email, but that's app-level discipline,
-- not a guarantee — this is the guarantee. Root cause: a mobile keyboard's
-- default auto-capitalize on a bare email field stored "Jane@x.com" at
-- onboarding while login always lowercased before comparing, so that
-- operator's magic-link login silently matched nothing and no email was ever
-- sent, with no error anywhere. Complements, not replaces, the existing plain
-- unique index on the literal `email` column (kept so Prisma's typed
-- findUnique({ where: { email } }) keeps working) — this index is what
-- actually prevents "Jane@x.com" and "jane@x.com" from being able to coexist
-- as two separate operators going forward.
CREATE UNIQUE INDEX "Operator_email_lower_unique" ON "Operator" (LOWER(email));