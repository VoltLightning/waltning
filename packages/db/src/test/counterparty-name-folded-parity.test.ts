/**
 * `name_folded` parity — R2 H1/L1, R3 M1/L1.
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
 *
 * **R3 M1.** `FOLD_SQL` no longer trims at all — `btrim("name")` only
 * stripped ASCII space, while `fold()`'s `.trim()` strips every Unicode
 * `White_Space` character, so a raw insert of a tab- or NBSP-padded name
 * used to fold differently on each engine. The fix moved trimming out of the
 * fold and into a CHECK (`counterparties_name_trimmed`) that refuses an
 * untrimmed `name` outright, so `CASES` below holds only already-trimmed
 * names — an untrimmed one is exercised separately, as a refusal, in the
 * describe block below.
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

    // R3 L1 — the collision this test is named for used to be asserted only
    // in prose ("R2 H1 is exactly this: … refuses the second spelling"), one
    // paragraph above where the code then archived the first row and moved
    // on without ever exercising the refusal it describes. This is that
    // assertion: `counterparties_name_uq` — live, on this same connection,
    // the same index a real capture goes through — refuses the NFC spelling
    // as a collision with the NFD one already in place, the same way it
    // refuses two spellings of a name that only differ by case.
    await expect(
      s.sql`INSERT INTO counterparties (name, kind) VALUES (${JOZEF_NFC}, 'person')`,
    ).rejects.toThrow(/counterparties_name_uq/);

    // Only now does the test work around the refusal it just proved:
    // archiving the first frees its folded name (the index is partial,
    // `WHERE NOT archived`) so the second insert's own `name_folded` can be
    // read back and compared directly.
    await s.sql`UPDATE counterparties SET archived = true WHERE id = ${decomposed?.id as string}`;

    const [composed] = await s.sql<{ id: string; name_folded: string }[]>`
      INSERT INTO counterparties (name, kind) VALUES (${JOZEF_NFC}, 'person')
      RETURNING id, name_folded`;

    expect(decomposed?.name_folded).toBe(composed?.name_folded);
    expect(decomposed?.name_folded).toBe(fold(JOZEF_NFC));

    await s.sql`DELETE FROM counterparties WHERE id IN (${decomposed?.id as string}, ${composed?.id as string})`;
  });
});

/**
 * R3 M1 — a name that JS `.trim()` would still shorten is refused outright,
 * never silently folded. `counterparties_name_trimmed` (`schema.ts`) is what
 * refuses it; `FOLD_SQL` no longer trims at all, so there is nothing for the
 * fold itself to disagree with `fold()` about.
 */
const UNTRIMMED_CASES: readonly [name: string, why: string][] = [
  // A plain ASCII space, both ends — the case `btrim()` alone did strip, kept
  // here so the refusal covers the ordinary case too, not only the Unicode
  // ones below.
  ["  Ola Nowak  ", "leading and trailing ASCII space"],
  // R3 M1's own reproduction: `btrim("name")` keeps a trailing tab; `.trim()`
  // does not.
  ["Marek\t", "a trailing tab"],
  // NBSP (U+00A0) — outside `btrim()`'s default charset, inside JS
  // White_Space.
  [" Marek", "a leading NBSP"],
];

describe("Postgres refuses a name JS .trim() would still shorten (R3 M1)", () => {
  it.each(UNTRIMMED_CASES)("refuses %j (%s)", async (name) => {
    await expect(
      s.sql`INSERT INTO counterparties (name, kind) VALUES (${name}, 'person')`,
    ).rejects.toThrow(/counterparties_name_trimmed/);
  });
});
