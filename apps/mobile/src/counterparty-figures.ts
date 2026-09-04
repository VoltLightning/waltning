/**
 * S12 and S13's shared figures — the fold from `listCounterpartyBalances`'s
 * per-currency rows (§7) to the one settlement-currency net a row or a card
 * shows, plus the display-currency equivalent whenever a rate answers (P1).
 *
 * A screen concern, not a domain component's: it reads `readRate` and a
 * `today`, neither of which `packages/ui`'s `CounterpartyRow` or
 * `BalanceLedger` know about — those components render whatever figure this
 * module resolved.
 */

import type { PhoneCounterpartyBalance } from "@waltning/client/ledger/create-phone-ledger";
import { counterpartyNet } from "@waltning/client/counterparties/counterparty-net";
import type { AccountingDate } from "@waltning/core/date";
import type { AgeBucket, CurrencyCode, Money, PivotPerUnit, UnitsPerPivot } from "@waltning/core/money";
import * as money from "@waltning/core/money";

export type CounterpartyBalanceLine = {
  currency: CurrencyCode;
  balance: Money;
  decimals: number;
};

export type CounterpartyGroup = {
  counterpartyId: string;
  name: string;
  kind: "person" | "company";
  settlementCurrency: CurrencyCode | null;
  balances: readonly CounterpartyBalanceLine[];
  /** The oldest open line across every currency held — companies only carry a real one (O15). */
  ageDays: number | null;
  ageBucket: AgeBucket | null;
};

/** One row per counterparty per currency (§7) folded into one row per counterparty. */
export function groupByCounterparty(
  rows: readonly PhoneCounterpartyBalance[],
): readonly CounterpartyGroup[] {
  const byId = new Map<string, CounterpartyGroup & { balances: CounterpartyBalanceLine[] }>();
  for (const row of rows) {
    if (money.isZero(row.balance)) continue;
    const existing = byId.get(row.counterpartyId);
    if (existing) {
      existing.balances.push({ currency: row.currency, balance: row.balance, decimals: row.decimals });
      // The oldest line across every currency this counterparty holds — one
      // ageing figure per person, taken at its oldest open row.
      if (row.ageDays !== null && (existing.ageDays === null || row.ageDays > existing.ageDays)) {
        existing.ageDays = row.ageDays;
        existing.ageBucket = row.bucket;
      }
      continue;
    }
    byId.set(row.counterpartyId, {
      counterpartyId: row.counterpartyId,
      name: row.name,
      kind: row.kind,
      settlementCurrency: row.settlementCurrency,
      balances: [{ currency: row.currency, balance: row.balance, decimals: row.decimals }],
      ageDays: row.ageDays,
      ageBucket: row.bucket,
    });
  }
  return [...byId.values()];
}

/**
 * Units of `currency` per one pivot, `"1"` for the pivot itself (`fx_rates`
 * never quotes it against itself), `null` when the replica holds none.
 */
export function makeRateOf(
  readRate: (pair: {
    base: CurrencyCode;
    quote: CurrencyCode;
    date: AccountingDate;
  }) => { rate: UnitsPerPivot } | null,
  pivot: CurrencyCode,
  date: AccountingDate,
): (currency: CurrencyCode) => UnitsPerPivot | null {
  return (currency) => {
    if (currency === pivot) return money.unitsPerPivot("1");
    return readRate({ base: pivot, quote: currency, date })?.rate ?? null;
  };
}

export type ResolvedCounterpartyFigures = {
  /** The currency the settlement figure ended up in — the preference when computable, a held fallback otherwise. */
  currency: CurrencyCode;
  value: Money;
  decimals: number;
  /** Present only when the settlement figure converts to something other than itself, and a rate answered. */
  display: { currency: CurrencyCode; rate: PivotPerUnit } | null;
};

/**
 * §6.6's net, in the counterparty's preferred settlement currency — falling
 * back to their own balance in whichever currency they actually hold when
 * the full cross-currency fold cannot be computed (P1: never a partial sum,
 * and never a hidden debt either — a single currency needs no rate at all).
 */
export function resolveCounterpartyFigures(
  group: Pick<CounterpartyGroup, "settlementCurrency" | "balances">,
  pivot: CurrencyCode,
  rateOf: (currency: CurrencyCode) => UnitsPerPivot | null,
): ResolvedCounterpartyFigures {
  const preferred = group.settlementCurrency ?? group.balances[0]?.currency ?? pivot;
  const fold = counterpartyNet(group.balances, preferred, rateOf);
  const preferredLine = group.balances.find((line) => line.currency === preferred);

  const currency = fold.complete || preferredLine ? preferred : (group.balances[0]?.currency ?? preferred);
  const value = fold.complete
    ? fold.value
    : (preferredLine?.balance ?? group.balances[0]?.balance ?? money.toMoney("0"));
  const decimals = group.balances.find((line) => line.currency === currency)?.decimals ?? 2;

  let display: ResolvedCounterpartyFigures["display"] = null;
  if (currency !== pivot) {
    const rate = rateOf(currency);
    if (rate !== null) display = { currency: pivot, rate: money.reciprocal(rate) };
  }

  return { currency, value, decimals, display };
}
