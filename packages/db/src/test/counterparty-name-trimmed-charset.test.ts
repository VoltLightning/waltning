/**
 * `JS_TRIM_CHARSET_SQL` (`schema.ts`) — proved code point by code point, not
 * only by the handful of names in `counterparty-name-folded-parity.test.ts`.
 *
 * **R4 C1.** `E'\v'` is not a recognised Postgres escape (`E'…'` supports
 * `\b \f \n \r \t` plus the numeric forms — no `\v`), so it fell through
 * "any other character following a backslash is taken literally" and became
 * the letter `v`. Two failures followed, both proved directly against
 * `btrim()` here rather than only through an insert: any name ending in `v`
 * (`Ivanov`, `Lev`, `van der Berg`) was refused by `counterparties_name_trimmed`
 * as though it were padded, and a name genuinely padded with U+000B (real
 * vertical tab) was *not* refused, because U+000B itself was never in the
 * charset.
 *
 * The loop below is the general proof: for every code point JS
 * `String.prototype.trim()` treats as whitespace (the ECMAScript
 * `WhiteSpace` and `LineTerminator` sets), `btrim('X' || ch, charset)`
 * strips it back to `'X'` — and, symmetrically, a handful of look-alikes JS
 * does *not* treat as whitespace prove the charset is not overbroad either.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JS_TRIM_CHARSET_SQL } from "../schema.ts";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("trimcharset");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/**
 * Every ECMAScript `WhiteSpace` + `LineTerminator` code point — the exact
 * set `String.prototype.trim()` strips, and the set `JS_TRIM_CHARSET_SQL`
 * claims to cover.
 */
const WHITESPACE_MEMBERS: readonly number[] = [
  0x0009,
  0x000a,
  0x000b,
  0x000c,
  0x000d, // tab, LF, VT, FF, CR
  0x0020, // space
  0x00a0, // NBSP
  0x1680, // Ogham space mark
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a, // the Unicode space separators
  0x2028, // line separator
  0x2029, // paragraph separator
  0x202f, // narrow no-break space
  0x205f, // medium mathematical space
  0x3000, // ideographic space
  0xfeff, // BOM / zero width no-break space
];

/**
 * Look-alikes JS `.trim()` does **not** strip, despite reading as
 * space-shaped — proves the charset does not overreach into refusing a name
 * that JS itself would leave alone.
 */
const NON_MEMBERS: readonly number[] = [
  0x180e, // Mongolian vowel separator — reclassified out of White_Space in Unicode 6.3
  0x200b, // zero width space — a joiner, not whitespace
  0x2060, // word joiner
  0x0085, // NEL — a Unicode line-break candidate, but not ECMAScript WhiteSpace/LineTerminator
];

function hex(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

const CASES: readonly [codePoint: number, isMember: boolean][] = [
  ...WHITESPACE_MEMBERS.map((c): [number, boolean] => [c, true]),
  ...NON_MEMBERS.map((c): [number, boolean] => [c, false]),
];

describe("btrim(charset) agrees with JS .trim() on every candidate code point (R4 C1)", () => {
  it.each(CASES)("%s", async (codePoint, isMember) => {
    const ch = String.fromCodePoint(codePoint);
    const jsTrimsIt = `X${ch}`.trim() === "X";
    // The fixture itself must actually exercise what it claims to — a
    // code point wrongly classified above would make this assertion (not
    // the Postgres one below) the one that catches it.
    expect(jsTrimsIt, `${hex(codePoint)} member=${isMember}`).toBe(isMember);

    const [row] = await s.sql.unsafe<{ trimmed: string }[]>(
      `SELECT btrim('X' || $1, ${JS_TRIM_CHARSET_SQL}) AS trimmed`,
      [ch],
    );
    const pgTrimsIt = row?.trimmed === "X";

    expect(pgTrimsIt, `${hex(codePoint)}: Postgres and JS must agree`).toBe(jsTrimsIt);
  });
});

/**
 * R4 C1's own reproduction: names ending in the letter `v` — the case
 * `E'\v'`'s silent fallback to a literal `v` refused outright, because
 * `btrim` treated a trailing `v` as whitespace to strip.
 */
const V_EDGED_NAMES: readonly string[] = ["Ivanov", "Lev", "van der Berg"];

describe("a name edged in the letter v inserts fine (R4 C1)", () => {
  it.each(V_EDGED_NAMES)("%j", async (name) => {
    const [row] = await s.sql<{ id: string; name: string }[]>`
      INSERT INTO counterparties (name, kind) VALUES (${name}, 'person')
      RETURNING id, name`;

    expect(row?.name).toBe(name);

    await s.sql`DELETE FROM counterparties WHERE id = ${row?.id as string}`;
  });
});
