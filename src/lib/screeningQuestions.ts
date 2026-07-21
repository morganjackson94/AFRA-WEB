// Canonical screening-question library. Mirrors the TEMPLATE_LIBRARY pattern
// (src/lib/templates.ts) but for the conversation, not the hiring-post
// creative. Must exactly match the live ManyChat master flow ("AFRA Master
// Flow v1") — this is the one place that copy is written down in the repo,
// so edit here first, then carry the change into ManyChat by hand.
//
// A candidate's actual flow is assembled per-operator, in this order:
//   1. Work authorization (universal, every candidate, every operator)
//   2. Role interest (only when the operator hires for more than one role)
//   3. Conditional knockouts (only the ones THIS operator selected onboarding
//      step 5 — see Operator.disqualifiers)
//   4. Competency block (FOH or BOH, by role group — free text)
// See buildAssembledQuestions(). Roles collapse into two groups: FOH (Front
// of House, Barista) and BOH (Back of House, Line Cook) — no Leadership
// group, the wizard has no such role.
//
// Deliberately no age/certification question (pending legal/BFOQ review).

export type ChoiceQuestion = {
  kind: "choice";
  key: string;
  question: string;
  /** quickReply MUST be <=20 chars — Instagram hard limit, fails silently above it. */
  options: { letter: string; label: string; quickReply: string }[];
  /** Letters that ALWAYS end the flow as a screen-out, for every operator —
   *  legal/compliance-grade disqualifiers only (e.g. work authorization), not
   *  business preferences. [] = no universal disqualifier on this question. */
  disqualifyingLetters: string[];
  /** Letters that disqualify ONLY for operators who opted into the matching
   *  slug during onboarding (see the DISQUALIFIERS list in OnboardingWizard.tsx
   *  and Operator.disqualifiers) — evaluated by evaluateDisqualification(). */
  conditionalDisqualifiers?: { letter: string; slug: string }[];
};

/** Free-text competency question — captured raw, never scored automatically.
 *  No AI grading integration exists in this repo yet; the founder reads
 *  these by hand for the founding cohort, same treatment as badHireText. */
export type FreeTextQuestion = {
  kind: "free_text";
  key: string;
  question: string;
};

/** "Which role are you interested in?" — options are the operator's actual
 *  selected role titles, populated dynamically at assembly time, not stored
 *  here. The answer is captured/displayed like any other, but does NOT drive
 *  roleId/roleTitle resolution for scoring — that still resolves via
 *  payload.roleId exactly as it does today. */
export type RoleSelectQuestion = {
  kind: "role_select";
  key: string;
  question: string;
};

export type ScreeningQuestion = ChoiceQuestion | FreeTextQuestion | RoleSelectQuestion;

export type RoleQuestionSet = { roleTitle: string; questions: ScreeningQuestion[] };

export const WORK_AUTH_QUESTION: ChoiceQuestion = {
  kind: "choice",
  key: "work_auth",
  question: "Are you legally able to work in the US?",
  options: [
    { letter: "A", label: "Yes", quickReply: "Yes" },
    { letter: "B", label: "No", quickReply: "No" },
  ],
  // Never conditional — legal requirement, not an operator preference.
  disqualifyingLetters: ["B"],
};

export const ROLE_SELECT_QUESTION: RoleSelectQuestion = {
  kind: "role_select",
  key: "role_select",
  question: "Which role are you interested in?",
};

// All 8, using the slugs already shipped in OnboardingWizard.tsx's
// DISQUALIFIERS list — not the spec doc's slightly different naming.
// Phrased neutrally by design: signaling which answer is "right" teaches the
// candidate to lie and poisons the operator's own screening data. Never a
// hard exit on a disqualifying answer — record it, keep the conversation
// going, let scoring handle it (the flow runs under the operator's brand;
// an abrupt end reads as the restaurant rejecting someone mid-conversation).
export const KNOCKOUT_QUESTIONS: ChoiceQuestion[] = [
  {
    kind: "choice",
    key: "ko_no_weekends",
    question: "Are you available to work weekends?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "no_weekends" }],
  },
  {
    kind: "choice",
    key: "ko_no_evenings",
    question: "Are you available for evening shifts?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "no_evenings" }],
  },
  {
    kind: "choice",
    key: "ko_under_6mo_experience",
    question: "Do you have at least 6 months of experience in a similar role?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "under_6mo_experience" }],
  },
  {
    kind: "choice",
    key: "ko_no_transportation",
    question: "Do you have reliable transportation to get to work?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "no_transportation" }],
  },
  {
    kind: "choice",
    key: "ko_cant_open",
    question: "Can you work opening shifts? These usually start early morning.",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "cant_open" }],
  },
  {
    kind: "choice",
    key: "ko_cant_close",
    question: "Can you work closing shifts? These usually run late.",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "cant_close" }],
  },
  {
    kind: "choice",
    key: "ko_no_food_handler_cert",
    question: "Do you have a current food handler's card?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "no_food_handler_cert" }],
  },
  {
    kind: "choice",
    key: "ko_wont_commit_3mo",
    question: "Are you looking for something at least 3 months long?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: [],
    conditionalDisqualifiers: [{ letter: "B", slug: "wont_commit_3mo" }],
  },
];

// Competency free text — same three axes (experience · pressure handling ·
// instincts/standards) in FOH vs BOH language. Don't add a fourth without
// removing one; every additional free-text question costs completion.
export const FOH_QUESTIONS: FreeTextQuestion[] = [
  { kind: "free_text", key: "foh_1_experience", question: "How long have you worked in a similar role, and where?" },
  {
    kind: "free_text",
    key: "foh_2_service_instincts",
    question: "Tell me about a time a customer was upset with you. What did you do?",
  },
  {
    kind: "free_text",
    key: "foh_3_pressure",
    question: "It's the busiest hour of your shift and everything's backed up at once. What do you do first?",
  },
];

export const BOH_QUESTIONS: FreeTextQuestion[] = [
  { kind: "free_text", key: "boh_1_experience", question: "How long have you worked in a kitchen, and which stations?" },
  { kind: "free_text", key: "boh_2_pressure", question: "Tickets are piling up and you're behind. What's your first move?" },
  {
    kind: "free_text",
    key: "boh_3_standards",
    question: "Tell me about a time you caught a mistake before it went out.",
  },
];

// One entry per ROLES option (src/app/onboarding/OnboardingWizard.tsx / ROLE_TITLES
// in src/app/onboarding/actions.ts), mapped to its FOH/BOH competency block.
// getQuestionSetForRole() intentionally returns ONLY this competency triple,
// not the full assembled flow — see buildAssembledQuestions() for why.
export const SCREENING_QUESTIONS: RoleQuestionSet[] = [
  { roleTitle: "Front of House", questions: FOH_QUESTIONS },
  { roleTitle: "Barista", questions: FOH_QUESTIONS },
  { roleTitle: "Back of House", questions: BOH_QUESTIONS },
  { roleTitle: "Line Cook", questions: BOH_QUESTIONS },
];

/** Resolves a role title to its competency question set; unmatched/missing
 *  titles fall back to the generic (first) set. Deliberately returns just
 *  the competency block, not the full per-operator flow: this is also what
 *  powers the onboarding wizard's step-3 "see the questions we'll ask"
 *  preview, which renders BEFORE step 5 where disqualifiers get chosen — it
 *  structurally can't show the final assembled set at that point, so this
 *  shows the one part that's actually knowable that early. */
export function getQuestionSetForRole(roleTitle: string | undefined | null): RoleQuestionSet {
  return SCREENING_QUESTIONS.find((s) => s.roleTitle === roleTitle) ?? SCREENING_QUESTIONS[0];
}

/**
 * The real per-operator candidate flow: work authorization, then role
 * interest (only when this operator hires for more than one role), then
 * only the knockouts this operator selected during onboarding, then the
 * role-group competency block. Order is knockouts-before-competency by
 * construction — cheap dropouts protect completion rate, expensive ones
 * (free text) destroy it if asked first.
 */
export function buildAssembledQuestions(
  roleTitle: string | undefined | null,
  operatorDisqualifiers: string[],
  operatorRoleTitles: string[],
): ScreeningQuestion[] {
  return [
    WORK_AUTH_QUESTION,
    ...(operatorRoleTitles.length > 1 ? [ROLE_SELECT_QUESTION] : []),
    ...KNOCKOUT_QUESTIONS.filter((q) =>
      q.conditionalDisqualifiers!.some((c) => operatorDisqualifiers.includes(c.slug)),
    ),
    ...getQuestionSetForRole(roleTitle).questions,
  ];
}

export type DecodedAnswer = {
  key: string;
  question: string;
  answerLetter: string;
  answerLabel: string;
  disqualifying: boolean;
};

function isDisqualifyingOption(
  question: ChoiceQuestion,
  letter: string,
  operatorDisqualifiers: string[] | undefined,
): boolean {
  if (question.disqualifyingLetters.includes(letter)) return true;
  if (!operatorDisqualifiers || !question.conditionalDisqualifiers) return false;
  return question.conditionalDisqualifiers.some(
    (c) => c.letter === letter && operatorDisqualifiers.includes(c.slug),
  );
}

/**
 * Maps one raw (key, answer) transcript entry through a question set.
 * Undefined on any miss (unknown key, unknown letter, blank free text) —
 * caller falls back to raw rendering. Pass the real operator's
 * `disqualifiers` (Operator.disqualifiers) so `disqualifying` reflects THIS
 * operator's actual configuration; omit it (e.g. the wizard's generic "see
 * the questions" preview, before an Operator exists) to see every letter
 * that COULD disqualify for some operator.
 */
export function decodeAnswer(
  set: RoleQuestionSet,
  key: string,
  rawAnswer: string,
  operatorDisqualifiers?: string[],
): DecodedAnswer | undefined {
  const question = set.questions.find((q) => q.key === key);
  if (!question) return undefined;

  if (question.kind !== "choice") {
    const text = rawAnswer.trim();
    if (!text) return undefined;
    return { key, question: question.question, answerLetter: "", answerLabel: text, disqualifying: false };
  }

  const letter = rawAnswer.trim();
  const option = question.options.find((o) => o.letter.toLowerCase() === letter.toLowerCase());
  if (!option) return undefined;
  return {
    key,
    question: question.question,
    answerLetter: option.letter,
    answerLabel: option.label,
    disqualifying: isDisqualifyingOption(question, option.letter, operatorDisqualifiers),
  };
}

/**
 * The knockout evaluation itself — true if any answer disqualifies this
 * candidate for this operator (universal disqualifiers always count;
 * conditional ones only count if the operator opted into that slug during
 * onboarding). Only `choice`-kind questions can disqualify — free text and
 * role-select never do. Used by ingestScreeningResult() to compute
 * `outcome` when ManyChat doesn't send one — see manychat.ts.
 */
export function evaluateDisqualification(
  set: RoleQuestionSet,
  answers: Record<string, string>,
  operatorDisqualifiers: string[],
): boolean {
  for (const [key, rawAnswer] of Object.entries(answers)) {
    const question = set.questions.find((q) => q.key === key);
    if (!question || question.kind !== "choice") continue;
    const letter = rawAnswer.trim();
    if (isDisqualifyingOption(question, letter, operatorDisqualifiers)) return true;
  }
  return false;
}

/**
 * Snapshots resolved question+option text for a completed screening at ingest
 * time, so candidate records stay decodable even after the library changes
 * later. Returns undefined when there's nothing decodable (raw answers are
 * still preserved separately either way — see ingestScreeningResult). Takes
 * an already-resolved set (pass the real per-operator assembled set at
 * ingest time — see buildAssembledQuestions() — or the static
 * getQuestionSetForRole() result where operator context isn't available).
 */
export function snapshotAnswers(
  set: RoleQuestionSet,
  answers: Record<string, string> | undefined,
  operatorDisqualifiers?: string[],
): DecodedAnswer[] | undefined {
  if (!answers) return undefined;
  const snapshot: DecodedAnswer[] = [];
  for (const [key, rawAnswer] of Object.entries(answers)) {
    const decoded = decodeAnswer(set, key, String(rawAnswer), operatorDisqualifiers);
    if (decoded) snapshot.push(decoded);
  }
  return snapshot.length > 0 ? snapshot : undefined;
}
