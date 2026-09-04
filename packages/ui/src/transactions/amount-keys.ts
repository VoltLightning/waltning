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

import type { KeypadKey } from "./keypad";

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
