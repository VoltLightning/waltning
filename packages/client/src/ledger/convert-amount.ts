/**
 * `convertAmountRaw` — S31 §3's own destination-amount prefill.
 *
 * *"The destination amount is pre-filled from the reference rate and left
 * editable."* This is the one arithmetic step behind that sentence: an
 * amount, a `CrossRate` reference (`readCrossRate`'s own answer, M1 — a
 * triangulated pair rate, never a `PivotPerUnit`), and the destination's own
 * decimal scale, folded into the raw string `Keypad` edits — the same
 * canonical comma `amount-keys.ts#applyKey` reports, because this raw string
 * feeds the same `AmountField(hero)` that one does.
 *
 * **Lives here, not in the screen.** `tests/architecture.test.ts`'s "no
 * component outside the design system formats money" is aimed at *display*
 * — a figure hand-formatted instead of rendered through `<Amount>` — but a
 * `.tsx` scan cannot tell that from ordinary derived-model arithmetic, so
 * the arithmetic moves to where `packages/client`'s own remit already puts
 * it: "transport · hooks · client state · derived models" (`CLAUDE.md`).
 */

import * as money from "@waltning/core/money";

export function convertAmountRaw(
  /** A decimal string — `Money`, or `@waltning/ui`'s `parseAmount` output before it is ever branded (`client` never imports `ui`, `architecture/11`). */
  amount: money.Money | string,
  rate: money.CrossRate,
  decimals: number,
): string {
  const converted = money.round(money.toMoney(money.dec(amount).times(rate)), decimals);
  return converted.replace(".", ",");
}
