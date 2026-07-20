# Partial-serve design (future work, not built)

Status: **documentation only**. No code in this repo implements any of this. The
current behavior is the opposite — a full soft-block, described below — and that's
deliberate for now.

## What "partial-serve" means

An operator with locations in both restricted and unrestricted jurisdictions
(e.g. a chain with stores in Texas and Illinois) signs up normally, but
automated screening is only active for the unrestricted locations. The
Illinois location would exist in the system — visible in the dashboard,
included in billing — but its `ChannelConnection`/`ManychatFlow` would never
be allowed to go live, so no candidate in Illinois is ever screened by an
AEDT-style automated tool.

This is different from what's built today (see `src/lib/jurisdiction.ts`):
today, ANY restricted location blocks the *entire* signup. Partial-serve
would let the rest of the operator's business through.

## Why this wasn't built now

The full soft-block is a backstop for the founding cohort: warm outreach,
hand-picked operators, effectively zero revenue cost to turning away the rare
restricted-jurisdiction lead outright. Partial-serve exists to recover that
revenue once cold traffic (Meta ads) makes "just turn them away" too lossy to
accept — but building it now, before that pressure exists, would mean
carrying real legal exposure for no immediate benefit. The risk isn't that
partial-serve is hard to build — it's that it's easy to build *incompletely*,
and an incomplete version is worse than not building it, because it looks
compliant without being compliant. See the two enforcement seams below: one
of them (the manual ManyChat step) can't be enforced in code at all today,
which means a partial-serve system built now would depend on a human
remembering a rule, for something with statutory penalties attached. A full
block has no such failure mode — there's nothing to remember, because there's
nothing to serve.

## The two enforcement seams partial-serve requires

Both have to hold, not just one — a system that gets either wrong isn't
partial-serve, it's a leak with better UX.

### 1. Code seam: flows must be un-attachable to restricted locations at the model level

Today, `ChannelConnection`/`ManychatFlow` assignment has no jurisdiction
awareness at all — see `manychatPool.ts`'s `claimAvailableFlow()`, which
assigns the oldest available flow to whichever operator is waiting, with zero
concept of "this operator has a restricted location." For partial-serve, the
restriction has to be enforced at the point flows get attached to a
*location* (once locations are genuinely first-class multi-location records
with their own state/city, not the single default `Location` row
`provision()` creates today — see the Phase 1 finding in the jurisdiction
gate work: there's currently no per-location geography at all).

Concretely, this means:

- A restricted `Location` must be structurally incapable of holding an
  active `ChannelConnection`/`ManychatFlow` — a database constraint or a
  hard check in whatever function assigns flows, not a UI toggle that hides
  the "connect" button. Hiding a button is not compliance; a founder with API
  access, a support script, or a future engineer unaware of the rule can
  still attach a flow to that location.
- The restriction needs to survive the manual, human-in-the-loop parts of
  the system (see seam 2) — it can't only exist in application code that a
  bypassed API call or a direct database write could skip.

### 2. Process seam: the manual ManyChat clone-per-operator step needs a checklist gate

Per `manychatPool.ts`, connecting a channel today is **not** an API call —
it's the founder hand-cloning a flow in the ManyChat UI and pasting the
connect URL into the admin pool route. That means the actual "does this
candidate get automated screening" decision, for right now, is made by a
human clicking around in a third-party dashboard, not by this codebase.

Partial-serve requires that human step to have an explicit, un-skippable
checklist: before assigning/cloning a flow for a location, confirm that
location isn't in a restricted jurisdiction. Until the pool-assignment
process itself is code-driven (not hand-cloned), this seam is inherently a
process control, not a code control — which is exactly why it's the weaker
of the two, and exactly why shipping partial-serve before this step is
automated would mean the legal boundary depends on a founder remembering a
rule under time pressure, for every single flow assignment, forever.

## Why "seam partly enforced by manual process = silent legal failure mode" is disqualifying right now

If the code seam is solid but the process seam depends on human memory, the
system doesn't fail loudly when it fails — it fails silently. Nothing errors,
nothing pages anyone, no test catches it. A restricted-jurisdiction candidate
just gets screened by an AEDT-style tool with no bias audit and no advance
notice, and nobody finds out until an audit, a complaint, or a lawsuit. That
asymmetry — quiet failure with statutory penalties — is why the full block
(zero seams, because there's nothing partially allowed) is the right call
until the process seam can be made structural too.

## What triggers building this for real

**Meta ads turning on** (cold traffic) is the trigger — that's the point at
which "just turn away restricted-jurisdiction leads" stops being a rounding
error and starts being real lost revenue, per the tradeoff above.

Build partial-serve **together with**, not before, the actual compliance
infrastructure the underlying laws require: bias audits and advance candidate
notice (see the legal research report referenced when the jurisdiction gate
was specced). Partial-serve without that infrastructure just narrows *which*
locations are exposed to the same "we don't have compliance infra" problem
the full block exists to avoid — it doesn't solve it. The two should ship as
one project, not sequentially.
