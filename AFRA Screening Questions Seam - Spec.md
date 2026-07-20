# Spec: Make screening questions a real artifact (onboarding → dashboard → candidate records)

For Claude Code, in the AFRA-TTA-WEB repo. Written Jul 16, 2026 after auditing the operator journey end-to-end.

## The problem (verified in code)

1. **Onboarding step 2 promises questions that don't exist in the product.** `src/app/onboarding/OnboardingWizard.tsx` (~line 233) says *"Pick the role. We already wrote the questions to ask."* No screening-question content exists anywhere in the codebase. `ScreeningTemplate` (`src/lib/templates.ts`) is the hiring-post creative (headline/roleLabel/payLabel/cta) — not conversation questions. The actual questions are `[SAMPLE]` placeholders hand-typed into ManyChat per operator.
2. **The dashboard never shows the operator what their bot asks.** `src/app/dashboard/page.tsx` gates cover hiring post / Instagram / calendar / billing only.
3. **Candidate records are unreadable.** `src/app/dashboard/candidates/[id]/page.tsx` (~lines 131–148) renders the webhook transcript verbatim: the operator sees `Q1: A`, `Q2: B` with no question text and no option labels.

## The fix: one canonical question library, three read sites

### 1. `SCREENING_QUESTIONS` library (new, e.g. `src/lib/screeningQuestions.ts`)

Mirror the `TEMPLATE_LIBRARY` pattern. Must exactly match the live ManyChat master flow ("AFRA Master Flow v1"), which asks, in order:

| key | question (candidate-facing) | options (letter → label) | gating |
|-----|------------------------------|--------------------------|--------|
| q1 | What's your availability to work? | A Full-time · B Part-time · C Weekends only · D Not regularly | D disqualifies |
| q2 | Do you have reliable transportation to get to work? | A Yes · B No | B disqualifies |
| q3 | How many months of relevant experience do you have? | A Under 6 months · B 6–24 months · C 2+ years | none (informational) |
| q4 | Are you legally authorized to work in the U.S.? | A Yes · B No | B disqualifies |

Suggested shape:

```ts
export type ScreeningQuestion = {
  key: "q1" | "q2" | "q3" | "q4";
  question: string;
  options: { letter: string; label: string; quickReply: string }[]; // quickReply MUST be ≤20 chars (Instagram hard limit, silent failure above)
  disqualifyingLetters: string[]; // [] = informational
};
export type RoleQuestionSet = { roleTitle: string; questions: ScreeningQuestion[] };
export const SCREENING_QUESTIONS: RoleQuestionSet[]; // one entry per ROLES option (Front of House, Back of House, Barista, Line Cook)
```

v1: all four roles share this same generic set — the structure exists so roles can diverge later without a refactor. Do NOT include any age/certification question in the canonical set (pending legal/BFOQ review — see build map).

### 2. Onboarding step 2 — make the promise demonstrable

In `OnboardingWizard.tsx` step 2, under the role picker: an expandable "See the questions we'll ask" that renders the selected role's set (question + options, disqualifying options subtly marked). Read-only. Keeps the ~30-second step feel — collapsed by default.

### 3. Dashboard — "What your assistant asks" card

In `dashboard/page.tsx`: a read-only card listing the role's questions/options, disqualifying answers marked, with a note like "Finalized together on your setup call." Placement: near the readiness/gates block, visible pre-live (it's most valuable before the operator is live).

### 4. Candidate detail — decode the transcript

In `candidates/[id]/page.tsx`: map transcript keys/letters through the library — `q1 → question text`, `A → option label`. Resolve the question set via the candidate's `roleId` (fall back to the location's single role, then to the generic set). Unknown keys/letters render as today (raw) so nothing breaks on old/odd data.

**Optional hardening (recommended):** in `src/lib/manychat.ts` `ingestScreeningResult`, snapshot the question+option text into the `transcript` JSON at ingest time, so records stay decodable after future question edits. Render from snapshot when present, library otherwise.

## Acceptance criteria

- Step 2's "We already wrote the questions" has a visible artifact behind it (expandable preview).
- Operator can see their bot's exact questions on the dashboard at any time.
- Candidate detail shows real question text and option labels, never bare `q1: A`.
- All quickReply strings ≤20 chars (add a unit test — this is an Instagram hard limit).
- Existing candidates with letter-only transcripts still render (mapped when possible, raw fallback otherwise).

## Out of scope here (already handled / other lanes)

- ManyChat flow copy: once this library lands, the `[SAMPLE]` text in the master flow gets replaced with the canonical copy verbatim (Cowork/ManyChat session, not this repo).
- `validateCreativeText` extension to screening questions (`src/lib/creative.ts`) — separate P2 item, noted in the pre-launch checklist.
- Per-operator custom questions/gating editor — later; the concierge call + this library cover the founding cohort.
