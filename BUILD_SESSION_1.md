# AFRA — First Claude Code Session Brief
*Hand this to Claude Code. Builds the approval-independent core only. Everything here can be built and tested today with zero dependency on Meta/Google approval. B1 (the conversation engine) is deliberately HELD until the Day-0 ManyChat API check resolves the branch — do not start it this session.*

---

## Session goal (one sentence)

Stand up the spine: a system where **3 onboarding inputs create a configured operator instance, billing runs against it, and the `StartedSetup`/`WentLive` events fire** — so both fulfillment provisioning and ad-campaign measurement come online together.

## Why this order

`A2` billing emits the exact events (`StartedSetup`, `WentLive`) the Meta campaign optimizes on. So building billing **is** building the ad measurement. Doing A1+A2 first unblocks the ad launch and the fulfillment core in one pass. Everything that touches Meta/Google is stubbed.

## Hard guardrails for this session

- **Do NOT build B1 (Meta Messaging conversation engine).** It branches on the ManyChat API check that isn't done yet. Stub the channel.
- **Do NOT call real Meta or Google APIs.** Stub both behind interfaces (below).
- **Locations are first-class from line one.** Operator → many Locations → many Roles. Retrofitting per-location routing later is painful.
- Use whatever stack Claude Code recommends for speed; the only constraint is clean interface boundaries at every external dependency so the stubs swap for real later.

---

## Build order (this session)

### Step 1 — Data model (the spine)
Tables/objects, with relationships:
- `Operator` (account, billing status, Stripe customer id)
- `Location` (belongs to Operator; name, address, **timezone**, business hours) — **first-class**
- `Role` (belongs to Location; title, pay, hours, `readiness_state`)
- `ScreeningTemplate` (belongs to Role; cloned from a system default; editable text slots + photo ref)
- `ChannelConnection` (belongs to Operator; **stub** — fields for IG/Messenger token, status="stubbed")
- `CalendarConnection` (belongs to Location; **stub** — provider, status="stubbed")
- `Candidate`, `Conversation`, `Booking` (booking = the billable record; build the tables now, populate later)

**Done when:** schema migrates clean; a seed script creates a sample Operator (Sandoitchi) with 2 Locations (Dallas, Denver) and 1 Role.

### Step 2 — Provisioning function
The core of self-serve: onboarding inputs → configured instance, no human.
- Input: `{ instagram_handle, role (+pay), calendar_choice }` (the 3 minimum-friction inputs)
- Output: an Operator with a Location, a Role, a ScreeningTemplate cloned from the default, a stubbed ChannelConnection, a stubbed CalendarConnection
- Sets `readiness_state` per the gate logic (platform/calendar/template/billing) — all gates can be marked met-by-stub for now except billing

**Done when:** calling `provision(inputs)` produces a complete, queryable instance and returns its id.

### Step 3 — Stripe billing + the events
- Stripe integration: create customer, 2-week trial subscription, $199/mo per location, cancel, card update, dunning
- **Emit two events** (to your own analytics endpoint AND fire-ready for Meta Pixel/CAPI):
  - `StartedSetup` — provisioning begun (Step 2 entry)
  - `WentLive` — readiness gate fully met + trial active
- These are the SAME events the ad campaign optimizes on. Emit them server-side so they're trustworthy.

**Done when:** a test signup creates a real Stripe trial sub, and both events fire and are visible in your analytics + verifiable for Meta. *(Use Stripe test mode this session.)*

### Step 4 — Operator dashboard (thin)
- Pipeline view scaffold: applied → screened → booked → showed (empty states for now)
- The booking record display (the billable value event)
- Settings + hiring link/QR generation (the link carries `location_id` for routing)

**Done when:** an operator can log in, see their (empty) pipeline, their plan/trial status, and copy their location-scoped hiring link.

### Step 5 — Editable creative component (Level 2–3 ONLY)
- Render the hiring post from a **locked template** + the ScreeningTemplate's editable fields
- **Level 2:** editable text slots (headline, role, pay) — typed into defined fields, layout locked
- **Level 3:** photo swap (template image OR uploaded image into the fixed frame)
- **NOT Level 4** (no canvas / move / restyle / relayout)
- **Guardrails in scope now:** validation on editable text to block employment/Special-Ad-Category risk language (age terms, discriminatory phrasing, unsupported salary claims). Reject + explain on violation.

**Done when:** an operator can pick a template, edit the text slots, swap the photo, and guardrail validation blocks a test bad-input string.

---

## Explicitly STUBBED this session (real versions are Track B, post-approval)

| Stub | Interface to define now | Real version later |
|---|---|---|
| `ChannelConnection` | `connect()`, `sendMessage()`, `status` | B1 — Meta Messaging (after ManyChat check + App Review) |
| `CalendarConnection` | `getAvailability()`, `book()` | B2 — Google Calendar (after verification) |
| Nudge sending | `scheduleNudge()` logs intent | A5 logic exists; sending unstubs with B1 |

Build the **interfaces** real and clean; the implementations return stub data. This is what lets the real APIs drop in without refactoring.

---

## NOT this session (later, in order)

1. **B1 conversation engine** — held until ManyChat API check picks the branch (P2 orchestrate vs P3 own-engine)
2. **A4 booking engine live logic** — needs real calendar (B2)
3. **A5 nudge sending** — needs real channel (B1) + 24h-window/message-tag handling
4. Real Meta Pixel/CAPI wiring on the production landing page (pairs with Step 3's events)

---

## Definition of done for the whole session

A cold test signup can: hit provisioning → get a configured instance → start a Stripe trial → fire `StartedSetup` and `WentLive` → land in a dashboard with a working hiring link and an editable, guardrailed hiring post — **with Meta and calendar fully stubbed.**

At that point: the fulfillment spine exists, the ad-measurement events exist, and the only things between you and automated fulfillment are the two approval-gated integrations (B1, B2) — which is exactly the gap concierge covers.
