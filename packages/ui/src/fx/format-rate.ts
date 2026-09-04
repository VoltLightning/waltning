/**
 * `formatRate` — the one place an FX rate becomes display text.
 *
 * **The shared helper `<Amount>` already argues for**, generalised to a rate:
 * `<Amount>` renders through `money.forDisplay(value, decimals,
 * decimalMark(locale))` rather than the storage string, because a Polish
 * reader writes `4,0231` and `money.toMoney` only ever answers `4.0231` — the
 * storage form, always `.`. A rate column that prints the storage form
 * directly (`RateTable`'s own defect before this file existed) is correct
 * and unreadable in the same currency this product is mostly denominated in.
 *
 * **4dp, always** — `04` §4.6's own rule for a rate column and `RateField`'s
 * own rule for the value it edits, so a figure typed in one and rendered in
 * the other are never off by a digit of precision nobody asked to lose.
 *
 * **Not `<Amount>` itself.** `<Amount>` draws a currency-code affix and a
 * kind-based colour that make sense for a ledger figure and not for a rate —
 * a rate is not signed, has no `income`/`spend`/`transfer` reading, and its
 * unit is a pair of currency codes (`RateEditor`'s own `{quote} per {base}`),
 * not one trailing code. This is `money.forDisplay` under the same locale
 * rule, kept as its own function so `RateTable` and `RateField` (E5's own
 * branch) converge on one implementation instead of two that drift.
 */

import * as money from "@waltning/core/money";
import type { Locale } from "../i18n/locales.ts";
import { decimalMark } from "../i18n/locales.ts";

const RATE_DECIMALS = 4;

export function formatRate(rate: string, locale: Locale, decimals = RATE_DECIMALS): string {
  return money.forDisplay(money.toMoney(rate), decimals, decimalMark(locale));
}
