/**
 * `useForeignSpend` — S05 §3's currency chip and the charged figure behind it
 * (`SPEC.md` §7.8): *350 CZK paid with a EUR card* is typed as `350`, in `CZK`,
 * and the account's own figure is **pre-filled at the entry day's cross rate
 * and left editable** — the bank statement is the truth, and the rate is only
 * the first guess at it.
 *
 * **State here, arithmetic in `money.chargedFor`, the rate from the ledger.**
 * The screen owns what the person typed; this owns the two things that follow
 * from it — which currency the amount is in, and what the account was charged:
 *
 * - the paid currency, `null` for the account's own. A currency equal to the
 *   account's is the same as none (a switch to an account in the paid currency
 *   takes the entry back to one figure), so it is read as `null` rather than
 *   stored stale;
 * - the charged figure, **derived until typed over**. From the first edit it is
 *   the person's own and stops following the amount, the date and the rate —
 *   S31's destination keeps the same rule, for the same reason: a figure a
 *   person corrected must not be quietly replaced by the guess it corrected.
 *   Choosing another currency is a new question, so it drops the edit.
 *
 * With no rate for the day the charged figure is empty and `rate` is `null`:
 * the screen says so and the person types what the bank charged. Nothing is
 * priced at `1`.
 */

import { type AccountingDate, accountingDate, isAccountingDate } from "@waltning/core/date";
import {
  type CrossRate,
  type CurrencyCode,
  chargedFor,
  currencyCode,
  toMoney,
} from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";

/**
 * `readCrossRate`'s answer, as far as this hook reads it — structural, so this
 * module names no sibling (`architecture/11`): the rate, and each leg's own day.
 */
export type ForeignCrossRate = {
  rate: CrossRate;
  legs: { from: { asOf: AccountingDate }; to: { asOf: AccountingDate } };
};

export type ForeignSpendInput = {
  /** The ledger's own `readCrossRate` — a live read, so `revision` says when to ask again. */
  readCrossRate: (pair: {
    from: CurrencyCode;
    to: CurrencyCode;
    date: AccountingDate;
  }) => ForeignCrossRate | null;
  /** Moves whenever the ledger's rates may have — the read's cache key, not a value used. */
  revision: number;
  /** The chosen account's currency and fraction digits; `null` before one is chosen. */
  account: { currency: CurrencyCode; decimals: number } | null;
  /** The typed amount in `parseAmount`'s shape (`"350.5"`), or `null` while it does not read as one. */
  amount: string | null;
  /** The entry's day, as typed — mid-edit it can be a shape no rate is asked for. */
  date: string;
};

export type ForeignSpend = {
  /** The currency the amount is in, or `null` when it is the account's own. */
  paidCurrency: CurrencyCode | null;
  /** `null` takes the entry back to the account's own currency. */
  setPaidCurrency: (code: string | null) => void;
  /** The account's figure, in the reader's decimal mark — derived until typed over. */
  chargedRaw: string;
  setChargedRaw: (raw: string) => void;
  /** The cross rate the figure was priced at, and the day it is from — `null` when there is none. */
  rate: { rate: CrossRate; asOf: AccountingDate } | null;
  /** The figure is the person's own and no longer follows the amount. */
  chargedEdited: boolean;
};

export function useForeignSpend({
  readCrossRate,
  revision,
  account,
  amount,
  date,
}: ForeignSpendInput): ForeignSpend {
  const [chosen, setChosen] = useState<CurrencyCode | null>(null);
  // What was typed over the guess, and the account currency it was a figure in:
  // 14,02 € is not a figure in zł, so it dies with a change of account currency.
  const [typedIn, setTypedIn] = useState<{ raw: string; account: CurrencyCode | null } | null>(
    null,
  );

  const accountCurrency = account?.currency ?? null;
  const paidCurrency = chosen !== null && chosen !== accountCurrency ? chosen : null;
  const decimals = account?.decimals ?? 2;
  const typed = typedIn !== null && typedIn.account === accountCurrency ? typedIn.raw : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` says the ledger's rates may have moved; it is not read.
  const found = useMemo(() => {
    if (paidCurrency === null || accountCurrency === null || !isAccountingDate(date)) return null;
    return readCrossRate({ from: paidCurrency, to: accountCurrency, date: accountingDate(date) });
  }, [readCrossRate, revision, paidCurrency, accountCurrency, date]);

  const rate = useMemo(
    () =>
      found === null
        ? null
        : {
            rate: found.rate,
            // The staler leg is the one the figure is only as good as.
            asOf:
              found.legs.from.asOf < found.legs.to.asOf ? found.legs.from.asOf : found.legs.to.asOf,
          },
    [found],
  );

  const derived =
    found === null || amount === null
      ? ""
      : chargedFor(toMoney(amount), found.rate, decimals).replace(".", ",");

  const setPaidCurrency = useCallback((code: string | null) => {
    setChosen(code === null ? null : currencyCode(code));
    setTypedIn(null);
  }, []);
  const setChargedRaw = useCallback(
    (raw: string) => setTypedIn({ raw, account: accountCurrency }),
    [accountCurrency],
  );

  return {
    paidCurrency,
    setPaidCurrency,
    chargedRaw: typed ?? derived,
    setChargedRaw,
    rate,
    chargedEdited: typed !== null,
  };
}
