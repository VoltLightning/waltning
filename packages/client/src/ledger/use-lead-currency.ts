/**
 * The one subtotal a shell hero leads with — §7.0's display currency where the
 * ledger holds it, and the first subtotal the ledger holds where it does not.
 *
 * **It lives here, not in the app.** Picking a figure is behaviour, and
 * behaviour is shared by construction (`architecture/11`): the decision below
 * is the same one on a phone band, a desk band and the web build. A figure
 * chosen inside a `.tsx` shell file is also one no test can reach without
 * rendering a band around it, which is how the rule below went unexamined for
 * three rounds.
 *
 * **The preference wins whenever the ledger can honour it.** The band used to
 * lead with `subtotals[0]` while the dashboard's fold widgets led with the
 * display currency, so one page could name two currencies and neither said
 * which it was showing. One preference decides for both.
 *
 * **Where it cannot be honoured, the hero does not vanish — it falls back and
 * says so.** Returning nothing for "no subtotal in the display currency"
 * removed the whole hero row, so a ledger held entirely in EUR with the pivot
 * left at PLN drew a band with no figure at all: indistinguishable from an
 * empty ledger, on the one row whose job is to state your position. `fallback`
 * is `true` for exactly that case, and the caller captions it.
 *
 * **The fallback is the first subtotal in ledger order.** It is not the
 * largest, and ranking is not available to it: `design-system/05`'s
 * `CurrencyTotals` row settles that across the whole product — *"Order is the
 * ledger's: ranking by magnitude would put 12 480,20 above 8 400,00 across two
 * currencies nothing can compare"* — and the hero has no rates here, or the
 * display currency would have been honoured in the first place. A comparison
 * that needs a rate cannot be made by a component that has none, so the hero
 * takes the order the snapshot already defines rather than inventing one.
 *
 * `null` survives for the one case where it is the truth: no subtotals at all,
 * before the first account. There is nothing to fall back to, and a fabricated
 * `0.00` in an invented currency would be true and useless — `CurrencyTotals`
 * makes the same call on the phone.
 */

import type { CurrencyCode } from "@waltning/core/money";
import type { PhoneCurrencySubtotal, PhoneLedgerController } from "./create-phone-ledger.ts";
import { usePhoneLedger } from "./use-phone-ledger.ts";

export type LeadCurrency =
  | { entry: PhoneCurrencySubtotal; fallback: false }
  /** `missing` is the display currency the ledger holds nothing in — what the caption names. */
  | { entry: PhoneCurrencySubtotal; fallback: true; missing: CurrencyCode };

export function useLeadCurrency(
  ledger: PhoneLedgerController,
  /** §7.0's display currency, already resolved — `useDisplayCurrency` lives in the `currencies` module, and a module never imports another. */
  display: CurrencyCode,
): LeadCurrency | null {
  const snapshot = usePhoneLedger(ledger);
  const preferred = snapshot.subtotals.find((entry) => entry.currency === display);
  if (preferred) return { entry: preferred, fallback: false };

  const held = snapshot.subtotals[0];
  if (held === undefined) return null;
  return { entry: held, fallback: true, missing: display };
}
