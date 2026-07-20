// Canonical screening-question library. Mirrors the TEMPLATE_LIBRARY pattern
// (src/lib/templates.ts) but for the conversation, not the hiring-post
// creative. Must exactly match the live ManyChat master flow ("AFRA Master
// Flow v1") — this is the one place that copy is written down in the repo,
// so edit here first, then carry the change into ManyChat by hand.
//
// v1: all four roles share this same generic set. The per-role structure
// exists so roles can diverge later without a refactor, not because they
// diverge today. Deliberately no age/certification question (pending
// legal/BFOQ review).

export type ScreeningQuestion = {
  key: "q1" | "q2" | "q3" | "q4";
  question: string;
  /** quickReply MUST be <=20 chars — Instagram hard limit, fails silently above it. */
  options: { letter: string; label: string; quickReply: string }[];
  /** Letters that end the flow as a screen-out. [] = informational only. */
  disqualifyingLetters: string[];
};

export type RoleQuestionSet = { roleTitle: string; questions: ScreeningQuestion[] };

const GENERIC_QUESTIONS: ScreeningQuestion[] = [
  {
    key: "q1",
    question: "What's your availability to work?",
    options: [
      { letter: "A", label: "Full-time", quickReply: "Full-time" },
      { letter: "B", label: "Part-time", quickReply: "Part-time" },
      { letter: "C", label: "Weekends only", quickReply: "Weekends only" },
      { letter: "D", label: "Not regularly", quickReply: "Not regularly" },
    ],
    disqualifyingLetters: ["D"],
  },
  {
    key: "q2",
    question: "Do you have reliable transportation to get to work?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: ["B"],
  },
  {
    key: "q3",
    question: "How many months of relevant experience do you have?",
    options: [
      { letter: "A", label: "Under 6 months", quickReply: "Under 6 months" },
      { letter: "B", label: "6–24 months", quickReply: "6–24 months" },
      { letter: "C", label: "2+ years", quickReply: "2+ years" },
    ],
    disqualifyingLetters: [],
  },
  {
    key: "q4",
    question: "Are you legally authorized to work in the U.S.?",
    options: [
      { letter: "A", label: "Yes", quickReply: "Yes" },
      { letter: "B", label: "No", quickReply: "No" },
    ],
    disqualifyingLetters: ["B"],
  },
];

// One entry per ROLES option (src/app/onboarding/OnboardingWizard.tsx / ROLE_TITLES
// in src/app/onboarding/actions.ts). Same array reference across roles is
// intentional for v1 — see the module comment above.
export const SCREENING_QUESTIONS: RoleQuestionSet[] = [
  { roleTitle: "Front of House", questions: GENERIC_QUESTIONS },
  { roleTitle: "Back of House", questions: GENERIC_QUESTIONS },
  { roleTitle: "Barista", questions: GENERIC_QUESTIONS },
  { roleTitle: "Line Cook", questions: GENERIC_QUESTIONS },
];

/** Resolves a role title to its question set; unmatched/missing titles fall back to the generic (first) set. */
export function getQuestionSetForRole(roleTitle: string | undefined | null): RoleQuestionSet {
  return SCREENING_QUESTIONS.find((s) => s.roleTitle === roleTitle) ?? SCREENING_QUESTIONS[0];
}

export type DecodedAnswer = {
  key: string;
  question: string;
  answerLetter: string;
  answerLabel: string;
  disqualifying: boolean;
};

/** Maps one raw (key, letter) transcript entry through a question set. Undefined on any miss — caller falls back to raw rendering. */
export function decodeAnswer(set: RoleQuestionSet, key: string, rawAnswer: string): DecodedAnswer | undefined {
  const question = set.questions.find((q) => q.key === key);
  if (!question) return undefined;
  const letter = rawAnswer.trim();
  const option = question.options.find((o) => o.letter.toLowerCase() === letter.toLowerCase());
  if (!option) return undefined;
  return {
    key,
    question: question.question,
    answerLetter: option.letter,
    answerLabel: option.label,
    disqualifying: question.disqualifyingLetters.includes(option.letter),
  };
}

/**
 * Snapshots resolved question+option text for a completed screening at ingest
 * time, so candidate records stay decodable even after the library changes
 * later. Returns undefined when there's nothing decodable (raw answers are
 * still preserved separately either way — see ingestScreeningResult).
 */
export function snapshotAnswers(
  roleTitle: string | undefined | null,
  answers: Record<string, string> | undefined,
): DecodedAnswer[] | undefined {
  if (!answers) return undefined;
  const set = getQuestionSetForRole(roleTitle);
  const snapshot: DecodedAnswer[] = [];
  for (const [key, rawAnswer] of Object.entries(answers)) {
    const decoded = decodeAnswer(set, key, String(rawAnswer));
    if (decoded) snapshot.push(decoded);
  }
  return snapshot.length > 0 ? snapshot : undefined;
}
