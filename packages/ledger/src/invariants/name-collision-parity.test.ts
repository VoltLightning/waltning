/**
 * Proves: SPEC.md §6.6 ("Counterparties and debt") names counterparties as
 * first-class entities; `screens/S15-counterparty-editor.md` §6 ("Error" — an
 * exact name collision is "refused by the unique index on
 * `lower(btrim(name))`, stated on the field") and §9's first open question
 * ("Normalized equality was rejected as close to decorative: the unique
 * index already refuses `anna` and `Nina '") describe one guarantee against
 * *a* fold — the executor's is `lower(trim(name))`, fed by
 * `z.string().trim()` (`create-counterparty.executor.ts`,
 * `packages/core/src/registry/inputs.ts`), backed by
 * `counterparties_name_uq` on `packages/schema/src/counterparties.sqlite.ts`.
 *
 * This file is the phone's own half of the parity claim, through the Task 1
 * harness (`openJourney`, `session.createCounterparty`): for each pair in
 * `NAME_PAIRS`, create `a`, attempt `b`, and assert that whether it throws
 * equals `collide`. Postgres's half —
 * `packages/db/src/invariants/name-collision-parity.test.ts` — makes the same
 * assertion against the same corpus for the server's guard; the two files
 * being a matched pair, not one file with two assertions, is what lets each
 * engine disagree with the corpus for a different reason without the other
 * file's `it.fails` needing to move.
 *
 * Findings: R2 C1 (SQLite's ASCII-only `lower()` lets a Polish diacritic case
 * pair through — `counterparty-names.journey.test.ts` already covers the
 * single-word case; this file adds the full-diacritic Zażółć/ZAZOLC pair,
 * which fails the same way), R2 H1-r3 (NFC/NFD). Tab, NBSP and vertical tab
 * are *not* findings here: `z.string().trim()` strips ECMAScript's whole
 * whitespace set before the name ever reaches SQLite's `lower(trim())`, so
 * the phone refuses all three — see R2 M1-r4 / R2 C1-r4 in the Postgres half,
 * where `btrim`'s narrower default disagrees.
 */

import { NAME_PAIRS } from "@waltning/core/capture/names-corpus";
import { id } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { openJourney } from "../journeys/harness.ts";

/**
 * Create `a`, attempt `b`, report whether `b` threw.
 */
function attemptCollision(a: string, b: string): boolean {
  const j = openJourney();
  try {
    j.session.createCounterparty(
      {
        id: id<"counterparties">(crypto.randomUUID()),
        name: a,
        kind: "person",
        settlementCurrency: null,
        contact: null,
        note: "",
      },
      j.capture,
    );
    try {
      j.session.createCounterparty(
        {
          id: id<"counterparties">(crypto.randomUUID()),
          name: b,
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      return false;
    } catch {
      return true;
    }
  } finally {
    j.close();
  }
}

/**
 * The phone's own verdict per pair, keyed by `NAME_PAIRS` index, where it
 * disagrees with the corpus's `collide`. `undefined` means the executor
 * agrees with the corpus.
 */
const LEDGER_FINDING: Partial<Record<number, string>> = {
  0: "R2 C1", // Łukasz/łukasz
  1: "R2 H1-r3", // NFC/NFD
  10: "R2 C1", // Zażółć/ZAZOLC
};

describe("create_counterparty — the phone's half of the fold-guard parity", () => {
  NAME_PAIRS.forEach((pair, index) => {
    const finding = LEDGER_FINDING[index];
    const test = finding ? it.fails : it;
    const label = finding
      ? `${JSON.stringify(pair.a)} / ${JSON.stringify(pair.b)} — ${pair.why} (${finding})`
      : `${JSON.stringify(pair.a)} / ${JSON.stringify(pair.b)} — ${pair.why}`;

    test(label, () => {
      const refused = attemptCollision(pair.a, pair.b);
      expect(refused).toBe(pair.collide);
    });
  });
});
