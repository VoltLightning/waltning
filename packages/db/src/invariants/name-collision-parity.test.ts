/**
 * Proves: SPEC.md §6.6 ("Counterparties and debt") names counterparties as
 * first-class entities; `screens/S15-counterparty-editor.md` §6 ("Error" — an
 * exact name collision is "refused by the unique index on
 * `lower(btrim(name))`, stated on the field") and §9's first open question
 * ("Normalized equality was rejected as close to decorative: the unique
 * index already refuses `anna` and `Nina `") are what
 * `counterparties_name_uq` (`packages/db/src/schema.ts`) exists to hold.
 *
 * This file is Postgres's own half of the parity claim: for each pair in
 * `NAME_PAIRS`, insert `a` through raw SQL, attempt `b`, and assert that
 * whether it is refused equals `collide`. The phone's half —
 * `packages/ledger/src/invariants/name-collision-parity.test.ts`, exercised
 * through the Task 1 harness's `session.createCounterparty` — makes the same
 * assertion against the same corpus for SQLite's guard; the two files' being
 * a matched pair, not one file with two assertions, is what lets each engine
 * disagree with the corpus for a different reason without the other file's
 * `it.fails` needing to move.
 *
 * Findings: R2 C1 — fixed by #116 (a Polish letter's case pair, and the full
 * Polish-diacritic pair, pass Postgres's `lower()` under this repo's pinned
 * ICU collation (`docker-compose.yml`'s `--locale-provider=icu
 * --icu-locale=und-x-icu`, not the host's locale) — see the per-pair
 * comments below, this is narrower than R2's phone-side claim), R2 H1-r3 —
 * fixed by #116 (NFC/NFD), R2 M1-r4 — fixed by #116 (tab and NBSP are not
 * `btrim`'s default character), R2 C1-r4 — fixed by #116 (the `\v` escape,
 * same cause as R2 M1-r4).
 */
import { NAME_PAIRS } from "@waltning/core/capture/names-corpus";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("name_collision_parity");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/**
 * Insert `a`, attempt `b`, report whether `b` was refused. Cleans up after
 * itself by normalized name so the next pair starts from an empty table
 * regardless of which branch ran.
 */
async function attemptCollision(a: string, b: string): Promise<boolean> {
  await s.sql`insert into counterparties (id, name) values (gen_random_uuid(), ${a})`;
  let refused = false;
  try {
    await s.sql`insert into counterparties (id, name) values (gen_random_uuid(), ${b})`;
  } catch {
    refused = true;
  } finally {
    await s.sql`
      delete from counterparties
      where lower(btrim(name)) = lower(btrim(${a})) or lower(btrim(name)) = lower(btrim(${b}))`;
  }
  return refused;
}

/**
 * Postgres's own verdict per pair, keyed by `NAME_PAIRS` index, where it
 * disagrees with the corpus's `collide` — measured against this branch's
 * actual `counterparties_name_uq`, not assumed. `undefined` means Postgres
 * agrees with the corpus.
 */
const POSTGRES_FINDING: Partial<Record<number, string>> = {
  // NAME_PAIRS[0] — Łukasz/łukasz — is *not* here: this repo's Postgres runs
  // with ICU as its locale provider (`docker-compose.yml`'s
  // `--locale-provider=icu --icu-locale=und-x-icu`, not the host's glibc/C
  // locale — confirmed `lower('Łukasz' COLLATE "C") = lower('łukasz' COLLATE
  // "C")` is false), and ICU's root-locale `lower()` folds that specific case
  // pair correctly (a pure case change, no diacritic to strip), so Postgres
  // refuses it and agrees with the corpus. Only the phone disagrees on this
  // one — see R2 C1 in the ledger half of this pair.
  //
  // Every other index Postgres once disagreed on — R2 H1-r3 (NFC/NFD),
  // R2 M1-r4 (tab, NBSP), R2 C1-r4 (\v), R2 C1 (Zażółć/ZAZOLC) — is fixed by
  // #116: `FOLD_SQL` normalises to NFC before folding, `counterparties_name_trimmed`
  // refuses an untrimmed name outright (`JS_TRIM_CHARSET_SQL` covers tab, NBSP
  // and `\x0B` alike), and `translate()` folds the nine Polish diacritics.
};

describe("counterparties_name_uq — Postgres's half of the fold-guard parity", () => {
  NAME_PAIRS.forEach((pair, index) => {
    const finding = POSTGRES_FINDING[index];
    const test = finding ? it.fails : it;
    const label = finding
      ? `${finding} — ${JSON.stringify(pair.a)} / ${JSON.stringify(pair.b)} — ${pair.why}`
      : `${JSON.stringify(pair.a)} / ${JSON.stringify(pair.b)} — ${pair.why}`;

    test(label, async () => {
      const refused = await attemptCollision(pair.a, pair.b);
      expect(refused).toBe(pair.collide);
    });
  });
});
