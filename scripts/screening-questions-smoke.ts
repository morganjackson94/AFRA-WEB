import { SCREENING_QUESTIONS, decodeAnswer, getQuestionSetForRole, snapshotAnswers } from "../src/lib/screeningQuestions";

// No DB involved — this is a pure library test, unlike the other *-smoke.ts
// scripts. Same assert()/exit-1-on-failure convention for consistency.

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function main() {
  console.log("1) quickReply strings stay under Instagram's 20-char hard limit:");
  for (const set of SCREENING_QUESTIONS) {
    for (const q of set.questions) {
      for (const o of q.options) {
        assert(
          o.quickReply.length <= 20,
          `${set.roleTitle}/${q.key}/${o.letter} quickReply "${o.quickReply}" (${o.quickReply.length} chars) <= 20`,
        );
      }
    }
  }

  console.log("\n2) every role in the app has a question set:");
  for (const role of ["Front of House", "Back of House", "Barista", "Line Cook"]) {
    const set = getQuestionSetForRole(role);
    assert(set.roleTitle === role, `getQuestionSetForRole("${role}") resolves to that role, not a silent fallback`);
    assert(set.questions.length === 4, `${role} has all 4 questions`);
  }

  console.log("\n3) unmatched/missing role titles fall back to the generic set (never throw):");
  const fallback = getQuestionSetForRole("Some Made-Up Role");
  assert(fallback === SCREENING_QUESTIONS[0], "unknown role title falls back to the first (generic) set");
  assert(getQuestionSetForRole(undefined) === SCREENING_QUESTIONS[0], "undefined role title falls back too");
  assert(getQuestionSetForRole(null) === SCREENING_QUESTIONS[0], "null role title falls back too");

  console.log("\n4) disqualifyingLetters always reference real option letters:");
  for (const set of SCREENING_QUESTIONS) {
    for (const q of set.questions) {
      const letters = new Set(q.options.map((o) => o.letter));
      for (const dq of q.disqualifyingLetters) {
        assert(letters.has(dq), `${set.roleTitle}/${q.key} disqualifying letter "${dq}" matches a real option`);
      }
    }
  }

  console.log("\n5) decodeAnswer resolves valid (key, letter) pairs and flags disqualifying ones:");
  const set = getQuestionSetForRole("Barista");
  const decoded = decodeAnswer(set, "q1", "d");
  assert(decoded !== undefined, "decodeAnswer is case-insensitive on the letter");
  assert(decoded?.question === "What's your availability to work?", "decoded question text matches the library");
  assert(decoded?.answerLabel === "Not regularly", "decoded answer label matches the library");
  assert(decoded?.disqualifying === true, "D on q1 is flagged disqualifying");
  const clean = decodeAnswer(set, "q3", "B");
  assert(clean?.disqualifying === false, "B on q3 (informational question) is never disqualifying");

  console.log("\n6) decodeAnswer misses fall back to undefined, not a throw:");
  assert(decodeAnswer(set, "q9", "A") === undefined, "unknown question key returns undefined");
  assert(decodeAnswer(set, "q1", "Z") === undefined, "unknown option letter returns undefined");

  console.log("\n7) snapshotAnswers only keeps decodable entries, drops unknown keys, returns undefined when empty:");
  const snap = snapshotAnswers("Line Cook", { q1: "A", q2: "B", stray_key: "x" });
  assert(snap !== undefined && snap.length === 2, "known keys are snapshotted, stray key silently dropped");
  assert(snap?.[0].answerLabel === "Full-time", "snapshot entry carries the resolved label");
  assert(snapshotAnswers("Line Cook", {}) === undefined, "empty answers snapshot to undefined, not []");
  assert(snapshotAnswers("Line Cook", undefined) === undefined, "missing answers snapshot to undefined");

  console.log("\nScreening questions smoke test PASSED.");
}

try {
  main();
} catch (e) {
  console.error("\n" + (e as Error).message);
  process.exit(1);
}
