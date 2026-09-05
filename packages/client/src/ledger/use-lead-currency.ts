/**
 * The one subtotal a shell hero leads with — §7.0's display currency where the
 * ledger holds it, and the largest position you actually hold where it does
 * not.
 *
 * **It lives here, not in the app.** Picking a figure is behaviour, and
 * behaviour is shared by construction (`architecture/11`): the decision below
 * is the same one on a phone band, a desk band and the web build, and it is
 * `money` arithmetic, which `tests/architecture.test.ts` refuses to let an app
 * component do — a figure chosen in a `.tsx` file is a figure no test can
 * reach without rendering a shell around it.
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
 * **The fallback is the largest holding by absolute total, not the first.**
 * `subtotalsOf` folds balances in the order the accounts arrive, so the first
 * entry is whichever currency an account was opened in earliest — a dormant
 * `Savings · CHF` opened years ago, as often as not, in front of the account
 * everything actually runs through. Absolute rather than signed, because a
 * large debt is a position too: a card at `-9 000.00` is the figure worth
 * leading with and a `0.00` current account is not. Ties keep ledger order,
 * the only order this snapshot defines.
 *
 * `null` survives for the one case where it is the truth: no subtotals at all,
 * before the first account. There is nothing to fall back to, and a fabricated
 * `0.00` in an invented currency would be true and useless — `CurrencyTotals`
 * makes the same call on the phone.
 */

import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
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

  let held = snapshot.subtotals[0];
  if (held === undefined) return null;
  for (const entry of snapshot.subtotals) {
    if (money.cmp(money.abs(entry.balance), money.abs(held.balance)) > 0) held = entry;
  }
  return { entry: held, fallback: true, missing: display };
}
