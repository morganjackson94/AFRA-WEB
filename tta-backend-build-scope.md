# AFRA — Fulfillment Backend Build Scope (Option A)
*Build plan for the self-serve backend, sequenced for Claude Code. Organized around the real constraint: platform-approval time, not coding time. Inferences and "needs a human, not code" items are flagged.*

---

## The governing principle

**Code time is short. Approval time is long.** Claude Code can write this backend in days, but it cannot make Meta approve your app, and a cold operator cannot be fulfilled until Meta does. So the sequence below is built around one rule: **start the slow approval clocks on Day 0, build the approval-independent code in parallel, and bridge the gap with concierge fulfillment.**

This is the same "start the slow async thing first" lesson from the onboarding design — applied to your own build.

---

## Day 0 — Start the long poles (NOT code; do these first, today)

These gate everything and run on external clocks. Begin them before writing a line of backend.

1. **Meta App Review + Business Verification** — for Instagram/Messenger Messaging API access (permission to message an operator's DMs on their behalf). Days-to-weeks, can be rejected. **This is the critical path. Nothing self-serve fulfills until it clears.**
2. **Google Calendar API production verification** — if using restricted scopes for real availability read/write.
3. **Stripe account** — live mode, business details. Fast, but start it.
4. **[NEEDS HUMAN, NOT CODE]** Legal/compliance pass on: candidate data handling, employment-screening exposure (EEOC-type risk if screening logic disadvantages protected groups), and the editable-creative guardrails (below). *Flag: not legal advice — get a real review before live.*
5. **ManyChat API capability check (30 min against their docs).** Decides the B1 build branch (below). Specifically: *can ManyChat's API programmatically create/configure a whole new flow per operator and connect it to that operator's page, triggered from your provisioning system?* If yes → B1 can orchestrate ManyChat (faster). If no (likely — its API leans toward messaging/subscriber management *within* existing flows, not spinning up new tenant bots) → B1 is your own engine. **Do this before the first Claude Code session; it changes the build brief.**

> If these aren't moving, the build finishing early just means it sits idle waiting on Meta.

---

## Build Track A — Approval-INDEPENDENT (Claude Code starts now)

None of this waits on Meta. Build it immediately, in parallel with Day-0 clocks. This is the bulk of the line count and squarely Claude Code's strength.

### A1. Data model & provisioning core
The spine. Turns the 3 onboarding inputs into a configured operator instance.
- Objects: Operator, Location, Role, ScreeningTemplate, Channel(stub), CalendarConnection(stub), Candidate, Conversation, Booking
- **Locations first-class from v1** (per the earlier spec — retrofitting per-location routing is painful)
- Provisioning function: onboarding inputs → live, configured instance, no human

### A2. Stripe billing
- Subscription: 2-week free trial → $199/mo per location
- Trial-to-paid conversion + the `WentLive` / `StartedSetup` events the ad campaign optimizes on
- Dunning, cancel, card update

### A3. Operator dashboard
- Applicant pipeline view (applied → screened → booked → showed)
- The booked-interview record (the billable value event)
- Status, settings, hiring link/QR

### A4. Booking engine + routing logic
- Applicant picks slot → event on the **right location's** calendar
- Routing (entry link carries location_id; brand-IG fallback asks location)
- Buffer/business-hours logic
- *Calendar I/O is stubbed here; real calendar lands in Track B*

### A5. Nudge/reminder scheduler (logic only)
- The "we chase them so you don't" engine — the actual value prop
- Reminder cadence, no-show re-engagement (capped, per earlier design)
- **Built against the 24h-window/message-tag rules as a constraint from line one** — not retrofitted
- *Sending is stubbed until Meta clears; the scheduling logic is fully buildable now*

### A6. Editable creative component — **scoped at Level 2–3 only**
The hiring post (NOT the Meta ad creative — operators never touch those).
- **Level 1:** pick from 2–3 finished, identity-filled templates (the picker)
- **Level 2:** edit **text slots only** — headline, role, pay line — typed into defined fields over a **locked layout**
- **Level 3:** **photo swap** — use template image or upload their own into the fixed frame
- **NOT building Level 4** (free canvas: move/restyle/relayout). That's a design tool, explodes friction, breaks visual consistency, and creates non-compliant creative.
- **Guardrails (in scope from the start, not bolted on):** input validation on editable text to block employment/Special-Ad-Category risk language (age, discriminatory phrasing, unsupported salary claims). Editable-but-unguarded text is how an operator gets their own page flagged and blames you.
- **Size:** small, bounded component — defined fields rendered over a fixed template. *Not* a canvas editor. Barely moves the timeline if kept at 2–3.

---

## Build Track B — Approval-DEPENDENT (build the code now, can't go live until clocks clear)

Claude Code can write these in parallel, but they're inert until the Day-0 approvals land. Build against the APIs now; flip on when approved.

### B1. Meta Messaging integration — the conversation engine
The actual product: the candidate screening conversation. Exists today **only** as a hand-built ManyChat flow on Sandoitchi's page. Does NOT exist as a self-serve, multi-tenant, auto-provisioned thing.

**Build branches on the Day-0 ManyChat API check:**

- **Branch P3 (own engine — likely):** Talk directly to the Meta Messaging API. Run the STAFF screening logic (4 messages, 3 decision points) in your own code. Per-operator OAuth, token handling, live nudge *sending* (unstubs A5). No ManyChat. Only path that's truly self-serve + multi-tenant, because provisioning (A1) can stand up the conversation automatically when *you* own the engine. Removes a third-party dependency and the per-operator ManyChat cost.
- **Branch P2 (orchestrate ManyChat's API — only if the check passes):** Your provisioning system calls ManyChat's API to create/configure a flow per operator and bind it to their page. Faster to build *if* ManyChat actually supports per-tenant flow creation. **Risk:** ManyChat's API likely isn't designed for this; if it can only manage messages/subscribers inside *existing* flows, this branch dead-ends exactly where self-serve needs it.

**Live only when Meta App Review clears (either branch).**

> **ManyChat's real role:** it is the **concierge bridge mechanism** (see below), not a destination. The self-serve product almost certainly *replaces* ManyChat with Branch P3. ManyChat is how you fulfill by hand now; B1/P3 is what retires it.

### B2. Calendar integration
- Real availability read + real booking write (unstubs A4)
- **Live only when Google verification clears**

---

## The bridge — concierge fulfillment (covers the approval gap)

Because B1/B2 can't go live until approvals land, **a cold signup in that window is fulfilled by hand** — you wiring their screening flow exactly like Sandoitchi, behind the self-serve front. This is Option B operating *as the bridge to* Option A, not instead of it.

- **The bridge mechanism IS ManyChat, used exactly as today.** You manually clone the STAFF flow into each new operator's ManyChat account and connect it to their page. **Zero new build** — the "integration" in this phase is your hands in ManyChat's UI. Fine for ~5 operators; does not scale to 50.
- Ads run **small / capped** during this window (don't drive volume you can't hand-fulfill)
- Flip from manual (ManyChat by hand) → automated (B1/P3 own engine) **per operator** as B1/B2 come online. When B1 is live and trusted, ManyChat comes out entirely.
- This is also your real-world test that cold operators **activate and renew** — the one thing Sandoitchi can't tell you

---

## Critical path (visual)

```
DAY 0:  Meta App Review ───────────────[days–weeks]──────────► clears ─┐
        Google verify ──────────────[days]──────► clears ──────────────┤
        Stripe + legal ──[days]──► done                                │
                                                                       │
TRACK A (now): provisioning, Stripe, dashboard, booking logic,         │
        nudge logic, editable creative L2–3 ──► code-complete fast     │
                                                                       ▼
TRACK B (now): Meta + calendar code written ──────────► flip ON ──► AUTOMATED
                                                                       ▲
BRIDGE: capped ads + concierge fulfillment by hand ────────────────────┘
        (covers the gap; validates activation + renewal)
```

---

## What this means for the ad launch

- **Don't scale spend to the approval timeline.** Until B1 clears, every signup is hand-fulfilled, so budget stays small and honest.
- The Pixel/`StartedSetup`/`WentLive` events (from A2) are the same ones the campaign optimizes on — so the billing build and the ad measurement are **the same task**, do it once.
- Aggressive scaling unlocks when fulfillment is automated (B live) AND activation/renewal is proven (bridge data), not when the code compiles.

---

## What Claude Code does and doesn't change

| Speeds up (days not weeks) | Does NOT touch (calendar time) |
|---|---|
| Provisioning, data model, dashboard | Meta App Review queue |
| Stripe, events | Google API verification |
| Booking + routing logic | Legal/compliance judgment |
| Nudge scheduler logic | Screening-question design (what's *right*) |
| Editable creative L2–3 | The 24h-window design constraint |

**Code-complete ≠ able to fulfill a customer.** The gap between them is approval time. Concierge covers the gap.
