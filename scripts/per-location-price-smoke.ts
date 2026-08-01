import { perLocationMonthlyDollars, perLocationMonthlyDollarsForBucket } from "../src/lib/qualification";

// Proves the per-location price reflection (decided 2026-08-01, see
// docs/CLAIMS.md) computes honestly: exact-count math at a few sample sizes,
// bucket approximation uses each bucket's upper bound, "16+" falls back to
// its own floor (16), and the 1-2 bucket suppresses the line entirely rather
// than dividing by a tiny number and producing a scary per-location figure.
// Pure functions, no DB — nothing to clean up.

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function main() {
  console.log("Exact-count math (perLocationMonthlyDollars):");
  assert(perLocationMonthlyDollars(3) === 133, "3 locations -> $133/mo ($478,800/yr / 12 / 3)");
  assert(perLocationMonthlyDollars(8) === 50, "8 locations -> $50/mo (39900/8 = 4987.5 cents, rounds to $50)");
  assert(perLocationMonthlyDollars(15) === 27, "15 locations -> $27/mo (39900/15 = 2660 cents, rounds to $27)");

  console.log("\nBucket approximation (perLocationMonthlyDollarsForBucket) uses each bucket's UPPER bound:");
  assert(perLocationMonthlyDollarsForBucket("1-2") === null, '"1-2" bucket suppressed (returns null, no line renders)');
  assert(perLocationMonthlyDollarsForBucket("3-5") === perLocationMonthlyDollars(5), '"3-5" uses upper bound 5');
  assert(perLocationMonthlyDollarsForBucket("6-10") === perLocationMonthlyDollars(10), '"6-10" uses upper bound 10');
  assert(perLocationMonthlyDollarsForBucket("11-15") === perLocationMonthlyDollars(15), '"11-15" uses upper bound 15');
  assert(perLocationMonthlyDollarsForBucket("16+") === perLocationMonthlyDollars(16), '"16+" (no real upper bound) falls back to 16, its own floor');
  assert(perLocationMonthlyDollarsForBucket("16+")! < perLocationMonthlyDollarsForBucket("11-15")!, "more locations -> lower per-location cost, monotonic across buckets");
  assert(perLocationMonthlyDollarsForBucket("unknown-bucket") === null, "an unrecognized bucket value returns null, not a throw");

  console.log("\nPer-location price smoke test PASSED.");
}

main();
