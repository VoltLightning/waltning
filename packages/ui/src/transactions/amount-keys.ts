/**
 * `applyKey` — one `Keypad` tap folded onto the raw string it edits.
 *
 * **Pure, and the only place this arithmetic lives.** The screen holds a raw
 * string (`"48,90"`) rather than a parsed amount while typing — `Keypad`
 * cannot know what a half-typed `"48,"` should parse to, because it should not
 * parse to anything yet. This function is the one rule for how a key changes
 * that string; `AmountField`'s hero variant only ever *displays* the result,
 * and `parseAmount` is the one place it becomes a decimal string, once, when
 * the screen needs it. Two implementations of either would be the thing this
 * file exists to prevent.
 *
 * **The comma is always `","`, matching `Keypad`'s own reported key** — never
 * the locale's decimal mark. `decimalMark` only ever touches a *display*.
 */

import type { KeypadKey } from "./organisms/keypad/keypad";

/** `parseAmount`'s own cap on integer digits — `numeric(20,8)` holds twelve before the point. */
export const AMOUNT_INTEGER_DIGITS = 12;

/**
 * `raw` after one keypress, capped at `decimals` fraction digits.
 *
 * - **A leading `"0"` is replaced by the next digit** — `"0"` + `"5"` → `"5"` —
 *   so typing never leaves `"05"` on the screen. `"0"` + `","` is the one
 *   exception: a comma does not replace the zero, it follows it (`"0,"`),
 *   because `"0,5"` is a real half-złoty and `",5"` is not a string anyone
 *   would read as one.
 * - **A second comma is ignored.** `raw` already has at most one; a value with
 *   two would not be a number in either convention this product meets.
 * - **`delete` drops the last character.** An empty result (`""`) is a real
 *   value, not an edge case to guard against — it is `AmountField(hero)`'s own
 *   resting state.
 * - **At most `decimals` digits past the comma.** A key that would add a third
 *   fraction digit to a 2-decimal currency is silently refused rather than
 *   truncating what is already there — the same "do nothing" `,` gives past
 *   the first one.
 */
export function applyKey(raw: string, key: KeypadKey, decimals: number = 2): string {
  if (key === "delete") return raw.slice(0, -1);

  if (key === ",") {
    if (raw.includes(",")) return raw;
    return raw === "" ? "0," : `${raw},`;
  }

  const commaIndex = raw.indexOf(",");
  if (commaIndex !== -1) {
    const fractionDigits = raw.length - commaIndex - 1;
    if (fractionDigits >= decimals) return raw;
  }

  if (raw === "0") return key;
  return raw + key;
}

/**
 * `sanitizeAmount` — a typed string folded onto the same raw shape `applyKey`
 * keeps, for the composer whose amount is a `TextInput` rather than a keypad.
 *
 * **The same rules, applied to a whole string instead of one key.** The system
 * keyboard hands back anything — a pasted `"1 240,50 zł"`, a grouped
 * `"1,240.50"`, a dozen fraction digits — and the draft must hold only what
 * `parseAmount` can read: digits, at most one comma, at most `decimals` digits
 * after it. The draft's own mark is always `","` (`applyKey`'s rule).
 *
 * **The locale's mark decides which separator is the decimal.** The field
 * shows the figure with the locale's mark, so a person typing sees `565.20`
 * in English and `565,20` in Polish, and what they type back is read the
 * same way: the locale's mark, present once, *is* the mark and the other
 * separator is grouping; absent, the other separator once is the mark (a
 * numeric keypad offers only one) and more than once is grouping. A first
 * pass that took the first separator met as the mark read `"1,240.50"` as
 * `1,24`; a second that took the last read a Polish `500,00` with a stray
 * numpad `.` after it as `50000,` — one keystroke, a hundredfold.
 *
 * Digits past the account's fraction digits are cut, and a mark on a currency
 * with no fraction digits cuts the fraction with it — a refusal truncates, it
 * never concatenates (`"1200.50"` at 0 decimals is `1200`, not `120050`).
 */
export function sanitizeAmount(typed: string, decimals: number = 2, mark: "," | "." = ","): string {
  const other = mark === "," ? "." : ",";
  const kept = [...typed].filter(
    (char) => (char >= "0" && char <= "9") || char === "," || char === ".",
  );
  const marks = kept.filter((char) => char === mark).length;
  const others = kept.filter((char) => char === other).length;
  let markAt = -1;
  if (marks === 1) markAt = kept.indexOf(mark);
  else if (others === 1) markAt = kept.indexOf(other);
  const digitsOf = (chars: readonly string[]) =>
    chars.filter((char) => char >= "0" && char <= "9").join("");
  const whole = digitsOf(markAt === -1 ? kept : kept.slice(0, markAt)).replace(/^0+(?=\d)/, "");
  if (markAt === -1 || decimals <= 0) return whole;
  const fraction = digitsOf(kept.slice(markAt + 1)).slice(0, decimals);
  return `${whole === "" ? "0" : whole},${fraction}`;
}
