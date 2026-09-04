/**
 * `name_folded` parity — R2 H1/L1.
 *
 * `FOLD_SQL` (`schema.ts`) and `fold()` (`@waltning/core/capture/names`) are
 * two implementations of one rule, one per engine, because SQLite has no
 * generated columns and Postgres's `GENERATED ALWAYS AS` cannot call into
 * JS. Nothing but a test run against both keeps them agreeing: `FOLD_SQL`
 * used to fold without normalising first, so an NFD name — `o` plus a
 * combining acute, U+006F U+0301, the form some IMEs and iOS's own text
 * fields produce — was admitted by the generated column here while `fold()`
 * refused the identical name on the phone (`fold()` normalises to NFC
 * before anything else, precisely so decomposed and precomposed spellings
 * of the same name collide instead of missing each other at
 * `counterparties_name_uq`).
 *
 * Each case is inserted, and the column Postgres computes is compared
 * against the JS fold of the same input — not against a literal, so a
 * future edit to either side that quietly diverges from the other fails
 * here rather than only in production.
 */

import { fold } from "@waltning/core/capture/names";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("foldparity");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/**
 * NFD — "Józef" with `ó` as `o` (U+006F) plus a combining acute
 * (U+0301), the decomposed form some IMEs and iOS's own text fields
 * produce. The "folds an NFD and an NFC spelling..." test below asserts
 * the two constants really are different byte sequences before trusting
 * anything they feed into — a source file re-saved as NFC would
 * otherwise defeat this test without failing it.
 */
const JOZEF_NFD = "Józef";
/** The same name, precomposed: `ó` is one code point, not two. */
const JOZEF_NFC = "Józef";

/**
 * The corpus. Each `name` is inserted as-is; Postgres computes `name_folded`
 * and the test asserts it equals `fold(name.trim())` — `fold()` never trims
 * by itself (`names.ts`'s own note), matching every caller in
 * `packages/ledger` which trims before folding.
 */
const CASES: readonly string[] = [
  // NFD — decomposed base letter plus a combining acute (R2 H1's own case).
  JOZEF_NFD,
  // The same name, precomposed (NFC) — must fold identically to the above.
  JOZEF_NFC,
  // Uppercase Polish, several diacritics at once.
  "ŁUKASZ ŻÓŁW",
  // Mixed case and diacritics outside the nine Polish letters this fold maps.
  "KáROL Wiśniewski",
  // Plain ASCII — the baseline every case above must still agree with.
  "Marek Kowalski",
  // Leading/trailing whitespace, folded after trimming.
  "  Ola Nowak  ",
];

describe("Postgres's generated name_folded agrees with the phone's fold()", () => {
  it.each(CASES)("folds %j the same on both engines", async (name) => {
    const [row] = await s.sql<{ id: string; name_folded: string }[]>`
      INSERT INTO counterparties (name, kind) VALUES (${name}, 'person')
      RETURNING id, name_folded`;

    expect(row?.name_folded).toBe(fold(name.trim()));

    await s.sql`DELETE FROM counterparties WHERE id = ${row?.id as string}`;
  });

  it("folds an NFD and an NFC spelling of the same name to the same value", async () => {
    // Confirms the fixture actually exercises two different byte sequences —
    // otherwise this test would pass for a reason that has nothing to do
    // with normalisation.
    expect(JOZEF_NFD).not.toBe(JOZEF_NFC);
    expect(JOZEF_NFD.length).toBe(JOZEF_NFC.length + 1);
    expect(JOZEF_NFD.normalize("NFC")).toBe(JOZEF_NFC);

    const [decomposed] = await s.sql<{ id: string; name_folded: string }[]>`
      INSERT INTO counterparties (name, kind) VALUES (${JOZEF_NFD}, 'person')
      RETURNING id, name_folded`;

    // R2 H1 is exactly this: the fold now agrees across composition forms,
    // so `counterparties_name_uq` — live, on this same connection, the same
    // index a real capture goes through — refuses the second spelling as a
    // collision with the first, the same way it refuses two spellings of a
    // name that only differ by case. Archiving the first frees its folded
    // name (the index is partial, `WHERE NOT archived`) so the second
    // insert's own `name_folded` can be read back and compared directly.
    await s.sql`UPDATE counterparties SET archived = true WHERE id = ${decomposed?.id as string}`;

    const [composed] = await s.sql<{ id: string; name_folded: string }[]>`
      INSERT INTO counterparties (name, kind) VALUES (${JOZEF_NFC}, 'person')
      RETURNING id, name_folded`;

    expect(decomposed?.name_folded).toBe(composed?.name_folded);
    expect(decomposed?.name_folded).toBe(fold(JOZEF_NFC));

    await s.sql`DELETE FROM counterparties WHERE id IN (${decomposed?.id as string}, ${composed?.id as string})`;
  });
});
