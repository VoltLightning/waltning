/**
 * S12 and S13's shared figures — the fold from `listCounterpartyBalances`'s
 * per-currency rows (§7) to the one settlement-currency net a row or a card
 * shows, plus the display-currency equivalent whenever a rate answers (P1).
 *
 * **`packages/client`, not the app** — `tests/architecture.test.ts` requires
 * every app source file to be platform-bound, a test, or a route; this reads
 * `readRate` and a `today` (both the screen already has) and is shareable
 * logic with no platform dependency, so it lives beside `counterparty-net.ts`
 * rather than in `apps/mobile/src`. Two screens (`debt-screen.tsx`,
 * `counterparty-detail-screen.tsx`, `counterparty-editor-screen.tsx`) import
 * it; `packages/ui`'s `CounterpartyRow`/`BalanceLedger` only ever render
 * whatever figure this module already resolved.
 */

import type { AccountingDate } from "@waltning/core/date";
import type {
  AgeBucket,
  CurrencyCode,
  Money,
  PivotPerUnit,
  UnitsPerPivot,
} from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { counterpartyNet } from "./counterparty-net.ts";

export type CounterpartyBalanceLine = {
  currency: CurrencyCode;
  balance: Money;
  decimals: number;
};

/**
 * §7's row, structurally — the fields `groupByCounterparty` reads off
 * `PhoneCounterpartyBalance` (`ledger/create-phone-ledger.ts`). Structural
 * rather than imported: `counterparties` and `ledger` are sibling domains
 * inside `packages/client/src`, and a value import across that seam is what
 * `tests/module-boundaries.test.ts` refuses (`architecture/11` — compose at
 * the screen, never domain-to-domain). Every field this module needs, in the
 * same shape.
 */
export type CounterpartyBalanceRow = {
  counterpartyId: string;
  name: string;
  kind: "person" | "company";
  settlementCurrency: CurrencyCode | null;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  ageDays: number | null;
  bucket: AgeBucket | null;
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
  rows: readonly CounterpartyBalanceRow[],
): readonly CounterpartyGroup[] {
  const byId = new Map<string, CounterpartyGroup & { balances: CounterpartyBalanceLine[] }>();
  for (const row of rows) {
    if (money.isZero(row.balance)) continue;
    const existing = byId.get(row.counterpartyId);
    if (existing) {
      existing.balances.push({
        currency: row.currency,
        balance: row.balance,
        decimals: row.decimals,
      });
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
 * `readRate`'s answer, stripped to what `resolveCounterpartyFigures` needs —
 * the rate itself, in `fx_rates`' own direction, and the date it is actually
 * for (`asOf`, never `date`: a carried rate is for an earlier day than the
 * one asked about, and `atRateDate` states the day the rate is really from).
 * `"1"` for the pivot itself (`fx_rates` never quotes it against itself),
 * `null` when the replica holds none.
 */
export function makeRateOf(
  readRate: (pair: {
    base: CurrencyCode;
    quote: CurrencyCode;
    date: AccountingDate;
  }) => { rate: UnitsPerPivot; asOf: AccountingDate } | null,
  pivot: CurrencyCode,
  date: AccountingDate,
): (currency: CurrencyCode) => { rate: UnitsPerPivot; asOf: AccountingDate } | null {
  return (currency) => {
    if (currency === pivot) return { rate: money.unitsPerPivot("1"), asOf: date };
    return readRate({ base: pivot, quote: currency, date });
  };
}

export type ResolvedCounterpartyFigures = {
  /** The counterparty's own preferred settlement currency (or a held fallback with no preference set). */
  currency: CurrencyCode;
  /**
   * `null` when a currency this counterparty holds has no rate to fold into
   * `currency` — **never a substitute single-currency balance** (P1: an
   * incomplete net is absent, not swapped for a number that looks like one).
   * A caller with nothing else to show renders the per-currency balances
   * themselves instead (`CounterpartyRow`, `BalanceLedger`'s own rows).
   */
  value: Money | null;
  decimals: number;
  /** Present only when `value` is not `null` and it converts to something other than itself, with a rate that answered. */
  display: { currency: CurrencyCode; rate: PivotPerUnit; asOf: AccountingDate } | null;
};

/**
 * §6.6's net, in the counterparty's preferred settlement currency — `null`
 * when the full cross-currency fold cannot be computed (P1: never a partial
 * sum, and never a hidden debt either — a single currency needs no rate at
 * all, so a counterparty holding only their own settlement currency is
 * always complete).
 */
export function resolveCounterpartyFigures(
  group: Pick<CounterpartyGroup, "settlementCurrency" | "balances">,
  pivot: CurrencyCode,
  rateOf: (currency: CurrencyCode) => { rate: UnitsPerPivot; asOf: AccountingDate } | null,
): ResolvedCounterpartyFigures {
  const preferred = group.settlementCurrency ?? group.balances[0]?.currency ?? pivot;
  const numericRateOf = (currency: CurrencyCode): UnitsPerPivot | null =>
    rateOf(currency)?.rate ?? null;
  const fold = counterpartyNet(group.balances, preferred, numericRateOf);
  const decimals = group.balances.find((line) => line.currency === preferred)?.decimals ?? 2;

  if (!fold.complete) {
    return { currency: preferred, value: null, decimals, display: null };
  }

  let display: ResolvedCounterpartyFigures["display"] = null;
  if (preferred !== pivot) {
    const answer = rateOf(preferred);
    if (answer !== null) {
      display = { currency: pivot, rate: money.reciprocal(answer.rate), asOf: answer.asOf };
    }
  }

  return { currency: preferred, value: fold.value, decimals, display };
}

/**
 * `settle_debt`'s own residual (H9), as a direction rather than a sign — P5:
 * a screen states this in words, never a bare `+`/`-`. The three values are
 * `en.ts`'s own key suffixes under `counterparties.*`
 * (`theyOweYou`/`youOweThem`/`settled`), so a screen resolves one straight
 * through `useT()` without restating the comparison.
 *
 * **Here, not in the screen.** `money.cmp` outside `packages/ui` is exactly
 * what `tests/architecture.test.ts`'s "no component formats money by hand"
 * rule refuses — a screen's own `.tsx` is scanned, `packages/client`'s `.ts`
 * is where this sign check belongs instead.
 */
export function settleResidualDirection(residual: Money): "theyOweYou" | "youOweThem" | "settled" {
  const sign = money.cmp(residual, money.ZERO);
  if (sign === 0) return "settled";
  return sign > 0 ? "theyOweYou" : "youOweThem";
}
