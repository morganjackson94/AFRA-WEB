import {
  buildAssembledQuestions,
  decodeAnswer,
  getQuestionSetForRole,
  KNOCKOUT_QUESTIONS,
  ROLE_SELECT_QUESTION,
  SCREENING_QUESTIONS,
  snapshotAnswers,
  WORK_AUTH_QUESTION,
} from "../src/lib/screeningQuestions";

// No DB involved — this is a pure library test, unlike the other *-smoke.ts
// scripts. Same assert()/exit-1-on-failure convention for consistency.

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const CHOICE_QUESTIONS = [WORK_AUTH_QUESTION, ...KNOCKOUT_QUESTIONS];

function main() {
  console.log("1) quickReply strings stay under Instagram's 20-char hard limit:");
  for (const q of CHOICE_QUESTIONS) {
    for (const o of q.options) {
      assert(
        o.quickReply.length <= 20,
        `${q.key}/${o.letter} quickReply "${o.quickReply}" (${o.quickReply.length} chars) <= 20`,
      );
    }
  }

  console.log("\n2) every role in the app resolves to a 3-question FOH/BOH competency block:");
  for (const role of ["Front of House", "Back of House", "Barista", "Line Cook"]) {
    const set = getQuestionSetForRole(role);
    assert(set.roleTitle === role, `getQuestionSetForRole("${role}") resolves to that role, not a silent fallback`);
    assert(set.questions.length === 3, `${role} has all 3 competency questions`);
    assert(
      set.questions.every((q) => q.kind === "free_text"),
      `${role}'s competency questions are all free text (captured raw, no AI grading built yet)`,
    );
  }
  assert(
    getQuestionSetForRole("Barista").questions === getQuestionSetForRole("Front of House").questions,
    "Barista shares the FOH competency block",
  );
  assert(
    getQuestionSetForRole("Line Cook").questions === getQuestionSetForRole("Back of House").questions,
    "Line Cook shares the BOH competency block",
  );

  console.log("\n3) unmatched/missing role titles fall back to the generic (first) set (never throw):");
  const fallback = getQuestionSetForRole("Some Made-Up Role");
  assert(fallback === SCREENING_QUESTIONS[0], "unknown role title falls back to the first set");
  assert(getQuestionSetForRole(undefined) === SCREENING_QUESTIONS[0], "undefined role title falls back too");
  assert(getQuestionSetForRole(null) === SCREENING_QUESTIONS[0], "null role title falls back too");

  console.log("\n4) disqualifyingLetters/conditionalDisqualifiers always reference real option letters:");
  for (const q of CHOICE_QUESTIONS) {
    const letters = new Set(q.options.map((o) => o.letter));
    for (const dq of q.disqualifyingLetters) {
      assert(letters.has(dq), `${q.key} universal disqualifying letter "${dq}" matches a real option`);
    }
    for (const cd of q.conditionalDisqualifiers ?? []) {
      assert(letters.has(cd.letter), `${q.key} conditional disqualifying letter "${cd.letter}" (${cd.slug}) matches a real option`);
    }
  }

  console.log("\n5) decodeAnswer resolves both choice and free-text questions correctly:");
  // Real assembled flow: an operator who selected no_transportation, hiring for Barista only.
  const assembled = {
    roleTitle: "Barista",
    questions: buildAssembledQuestions("Barista", ["no_transportation"], ["Barista"]),
  };
  assert(
    assembled.questions.length === 1 /* work auth */ + 1 /* selected knockout */ + 3 /* FOH competency */,
    "assembled set is work-auth + the one selected knockout + 3 competency questions (no role-select, single role)",
  );
  assert(
    !assembled.questions.some((q) => q.key === ROLE_SELECT_QUESTION.key),
    "role-select question is absent when the operator hires for only one role",
  );

  const decodedChoice = decodeAnswer(assembled, "work_auth", "b");
  assert(decodedChoice !== undefined, "decodeAnswer is case-insensitive on the letter");
  assert(decodedChoice?.answerLabel === "No", "decoded choice answer label matches the library");
  assert(decodedChoice?.disqualifying === true, "work_auth=No is universally disqualifying");

  const decodedKnockout = decodeAnswer(assembled, "ko_no_transportation", "B", ["no_transportation"]);
  assert(decodedKnockout?.disqualifying === true, "the operator-selected knockout disqualifies when the operator's own disqualifiers are passed");
  const decodedKnockoutOtherOperator = decodeAnswer(assembled, "ko_no_transportation", "B", []);
  assert(
    decodedKnockoutOtherOperator?.disqualifying === false,
    "the exact same answer does NOT disqualify when passed a different (empty) operator disqualifiers list",
  );

  const decodedFreeText = decodeAnswer(assembled, "foh_1_experience", "Two years at a downtown cafe.");
  assert(decodedFreeText !== undefined, "free-text answers decode too");
  assert(decodedFreeText?.answerLabel === "Two years at a downtown cafe.", "free-text answer is captured verbatim");
  assert(decodedFreeText?.disqualifying === false, "free text is never disqualifying");
  assert(decodeAnswer(assembled, "foh_1_experience", "   ") === undefined, "blank free-text answer decodes to undefined, not an empty entry");

  console.log("\n6) decodeAnswer misses fall back to undefined, not a throw:");
  assert(decodeAnswer(assembled, "not_a_real_key", "A") === undefined, "unknown question key returns undefined");
  assert(decodeAnswer(assembled, "work_auth", "Z") === undefined, "unknown option letter returns undefined");

  console.log("\n7) role-select question appears when the operator hires for more than one role:");
  const multiRole = buildAssembledQuestions("Line Cook", [], ["Line Cook", "Back of House"]);
  assert(
    multiRole.some((q) => q.key === ROLE_SELECT_QUESTION.key),
    "role-select question is present when the operator hires for more than one role",
  );
  assert(
    multiRole[1].key === ROLE_SELECT_QUESTION.key,
    "role-select is positioned right after work authorization",
  );

  console.log("\n8) snapshotAnswers only keeps decodable entries, drops unknown keys, returns undefined when empty:");
  const lineCookSet = getQuestionSetForRole("Line Cook");
  const snap = snapshotAnswers(lineCookSet, { boh_1_experience: "3 years, grill and saute", stray_key: "x" });
  assert(snap !== undefined && snap.length === 1, "known keys are snapshotted, stray key silently dropped");
  assert(snap?.[0].answerLabel === "3 years, grill and saute", "snapshot entry carries the resolved answer");
  assert(snapshotAnswers(lineCookSet, {}) === undefined, "empty answers snapshot to undefined, not []");
  assert(snapshotAnswers(lineCookSet, undefined) === undefined, "missing answers snapshot to undefined");

  console.log("\nScreening questions smoke test PASSED.");
}

try {
  main();
} catch (e) {
  console.error("\n" + (e as Error).message);
  process.exit(1);
}
