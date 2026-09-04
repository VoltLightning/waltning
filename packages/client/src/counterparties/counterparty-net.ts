/**
 * `counterpartyNet` — the fold that "justifies the model change"
 * (`design-system/05` §5.5): one counterparty, several currencies, one net
 * figure in a target currency.
 *
 * **§6.6's cross-currency net, computed once, shared by `CounterpartyRow`
 * (S12's compact line) and `BalanceLedger` (S13's full card).** Both need the
 * same "net in {settlement}" / "net in {display}" totals `listCounterpartyBalances`
 * itself does not compute — it returns one row per currency, and turning that
 * into a single figure needs a rate per currency, which is a client concern
 * (`readRate`), not `packages/core`'s.
 *
 * **P1, and it is why this returns a union rather than a possibly-wrong
 * `Money`.** A rate missing for *any* currency the counterparty holds makes
 * the whole net unknowable — a partial sum would be a wrong number that looks
 * right — so `complete: false` is the only way to report that, and every
 * caller must render nothing rather than guess.
 */

import type { CurrencyCode, Money, UnitsPerPivot } from "@waltning/core/money";
import * as money from "@waltning/core/money";

export type CounterpartyBalanceLine = {
  currency: CurrencyCode;
  balance: Money;
};

export type CounterpartyNet = { complete: true; value: Money } | { complete: false };

/**
 * `rateOf(currency)` answers `fx_rates`' own direction (units of `currency`
 * per one pivot) or `null` when none is held — the same shape `readRate`'s
 * `.rate` is, with the pivot's own identity (`"1"`) resolved by the caller
 * (`fx_rates` never quotes the pivot against itself).
 */
export function counterpartyNet(
  balances: readonly CounterpartyBalanceLine[],
  target: CurrencyCode,
  rateOf: (currency: CurrencyCode) => UnitsPerPivot | null,
): CounterpartyNet {
  const targetRate = rateOf(target);
  if (targetRate === null) return { complete: false };

  let total = money.toMoney("0");
  for (const line of balances) {
    if (line.currency === target) {
      total = money.add(total, line.balance);
      continue;
    }
    const lineRate = rateOf(line.currency);
    if (lineRate === null) return { complete: false };
    total = money.add(total, money.convert(line.balance, lineRate, targetRate));
  }
  return { complete: true, value: total };
}
