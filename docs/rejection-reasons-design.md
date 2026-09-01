# Rejection-reason breakdown (future work, not built)

Status: **documentation only**. No code in this repo implements this. The
September 2026 "Screened out" dashboard section (see `src/app/dashboard/
page.tsx`, the `rejectedView` block) ships a count and a drill-in list of
names — this is the next layer on top of that, deliberately not built yet.

## What's missing from the count alone

A raw "screened out" number tells an operator that rejections are happening.
It doesn't tell them *why* — and the reason is the part that actually lets
them calibrate whether their bar is set correctly, which matters most during
the trial specifically (see the "Screened out" section's own comment: this
is the exact window an operator is deciding whether the product works).

The data already exists to answer it. `ingestScreeningResult()`
(`src/lib/manychat.ts`) snapshots every knockout answer onto
`Conversation.transcript.questionSnapshot` at ingest time, each entry
carrying `{ key, question, answerLabel, disqualifying }` — the disqualifying
flag is already computed and stored per-answer, per-candidate. Nothing new
needs to be captured; this is purely an aggregation-and-display pass over
data that's already there.

## What it would look like

Something like:

```
Screened out — 12
  6  no weekend availability
  3  no reliable transportation
  2  under 6 months experience
  1  can't work closing shifts
```

Aggregated by counting, across an operator's `Conversation` rows where
`state === "failed"`, how many `questionSnapshot` entries have
`disqualifying: true`, grouped by `key` (or `question`, for display). One
candidate can trigger more than one disqualifying answer, so this is a
breakdown of *reasons cited*, not a partition of the 12 candidates — worth
being explicit about that distinction in whatever copy ships with it, the
same way the count-vs-list distinction mattered for the count itself.

## Why this is the version that earns the section its space

A bare count answers "is screening happening." A reason breakdown answers
the question an operator mid-trial actually has: is the bar filtering the
right thing, or is it quietly excluding half the applicant pool over a
dealbreaker that doesn't actually matter to them. That's a decision they
can only make with the reasons, not the number.

## Guardrails for whenever this gets built

- Still never implies a rejected candidate counts toward the free-20 trial
  cap — `countedTowardTrial` stays `false` for these regardless (see
  `manychat.ts`), and this breakdown is reasons-for-rejection, several steps
  removed from the trial-cap number entirely. Keep them visually and
  textually separate; don't let a bar chart of rejection reasons sit next to
  the "used X of 20" trial copy in a way that invites confusing the two.
- Reads from `questionSnapshot`, which is a point-in-time snapshot of the
  screening questions as they existed when that candidate was screened
  (`manychat.ts`'s own comment: "so records stay readable even after a
  future edit to SCREENING_QUESTIONS changes the live copy"). An operator
  who changes their knockout selections mid-trial will have a breakdown that
  mixes reasons from their old and new screener — that's correct/honest
  behavior, not a bug, but worth a line of copy acknowledging it if the
  breakdown spans a screener change.
