/**
 * `update_currency`, on the device — S17 §9.2, cosmetic patch only.
 *
 * **Compare-and-swap on `version`, then patch** — `update-account.executor.ts`'s
 * own shape exactly: the write carries the version it read, and a mismatch
 * means the row moved under the writer.
 *
 * **No archived guard, unlike `set_rate_source`.** Symbol, position and
 * decimals describe how a figure *renders* — an archived currency's own
 * history still renders through them (a transaction booked in a currency
 * archived since keeps showing its symbol), so refusing the write there
 * would leave a stale symbol with no way back short of un-archiving.
 *
 * **A `decimals` decrease is refused while anything live still holds the
 * currency (H5).** Growing precision never loses information; shrinking it
 * does — `4.20` in a 2dp currency truncated to 0dp reads as `4`, a figure
 * nobody typed. `archive_currency`'s own live-reference count, reused
 * exactly: only a live (non-archived) account or a live (not soft-deleted)
 * transaction counts, the same `computations.md` §1 T filter.
 *
 * **R4 H-r4 — the live-reference count is not the whole guarantee.** It
 * answers "does anything still transact in this currency", which is a
 * different question from "does anything already stored in it fit the
 * narrower scale" — an *archived* account's `opening_balance`, or a
 * *soft-deleted* transaction's own row, is neither live nor gone: the figure
 * is still sitting in the replica, still rendered the day the account is
 * unarchived or the row's own history is read, and a shrink that ignores it
 * produces exactly the silent truncation this whole guard exists to refuse.
 * `anyStoredFigureOverScale` mirrors `assert_currency_decimals_safe`
 * (`0012_transaction_scale_and_category_kind.sql`, C1) rather than the
 * narrower live-reference count above: every account regardless of
 * `archived`, every transaction's four money columns regardless of
 * `deleted_at` (M1 — a soft-deleted row can be restored later, so both
 * engines count it), and every transaction line regardless of its own
 * parent's `deleted_at` too.
 *
 * **Both checks run twice — in `validate`, before the outbox commits, and
 * again in `apply`.** A refused shrink is never recoverable by a later
 * replay of the identical input, so `validate` refuses it before any intent
 * is queued (`LocalExecutor.validate`'s own doc); `apply`'s own call is the
 * same duplication every other scale-checked executor carries, so a
 * `validate` that faults for a non-refusal reason never leaves the write
 * itself unchecked.
 */

import * as money from "@waltning/core/money";
import { type UpdateCurrencyInput, updateCurrencyInput } from "@waltning/core/registry/inputs";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { accounts, currencies, recurringTransactions, transactionLines, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateCurrencyExecutor = defineLocalExecutor<
  typeof updateCurrencyInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "update_currency",
  opVersion: 1,
  input: updateCurrencyInput,
  mints: () => [],
  // H — read-only, run before the outbox commits (`LocalExecutor.validate`'s
  // own doc): a decimals shrink that either the live-reference guard or
  // `anyStoredFigureOverScale` refuses is refused here too, never queued as
  // an intent nothing will ever apply — a shrink `apply` alone would refuse
  // left a stuck outbox entry behind forever, since a refused shrink is
  // never recoverable by a later replay of the identical input.
  validate: (input, tx) => assertDecimalsShrinkSafe(input, tx),
  apply: (input, tx) => patchCurrency(input, tx),
});

function patchCurrency(input: UpdateCurrencyInput, tx: ReplicaTx): LocalCurrencyRow {
  const [current] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!current) {
    throw new LocalRefusal(`update_currency: no currency ${input.code}`, { dependency: true });
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `update_currency: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  // Kept here too, alongside `validate` above — the same duplication
  // `create-account.executor.ts`'s own `insertAccount` and every other
  // scale-checked executor carries, so a validate that faults for a
  // non-refusal reason (a driver fault, a bug) never leaves the write itself
  // unchecked (`write.ts`'s own doc: a broken pre-check must never be the
  // reason a capture is lost, but it also must never be the reason one gets
  // through unchecked).
  assertDecimalsShrinkSafe(input, tx);

  const [updated] = tx
    .update(currencies)
    .set({ ...input.patch, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(and(eq(currencies.code, input.code), eq(currencies.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("update_currency: the row changed between read and write");
  }
  return updated;
}

/**
 * H — refuses a `decimals` shrink that either the live-reference guard or
 * `anyStoredFigureOverScale` (H-r4, C1) would refuse. Silent when the
 * currency itself is not in the replica or the patch does not shrink
 * `decimals` — the "no such currency" and stale-version refusals stay
 * `patchCurrency`'s own, since neither is a scale question `validate` should
 * answer before the outbox commits.
 */
function assertDecimalsShrinkSafe(input: UpdateCurrencyInput, tx: ReplicaTx): void {
  if (input.patch.decimals === undefined) return;

  const [current] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, input.code))
    .all();
  if (!current || input.patch.decimals >= current.decimals) return;

  const [{ n: liveAccounts } = { n: 0 }] = tx
    .select({ n: sql<number>`count(*)` })
    .from(accounts)
    .where(and(eq(accounts.currency, input.code), eq(accounts.archived, false)))
    .all();
  const [{ n: liveTransactions } = { n: 0 }] = tx
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        or(
          eq(transactions.currency, input.code),
          eq(transactions.toCurrency, input.code),
          eq(transactions.debtCurrency, input.code),
        ),
        isNull(transactions.deletedAt),
      ),
    )
    .all();
  const live = liveAccounts + liveTransactions;
  if (live > 0) {
    throw new LocalRefusal(
      `update_currency: refused — decimals cannot shrink from ${current.decimals} to ` +
        `${input.patch.decimals} while ${input.code} still names ${live} live account(s)/transaction(s)`,
    );
  }

  if (anyStoredFigureOverScale(tx, input.code, input.patch.decimals)) {
    throw new LocalRefusal(
      `update_currency: refused — decimals cannot shrink from ${current.decimals} to ` +
        `${input.patch.decimals} while a figure already stored in ${input.code} holds more`,
    );
  }
}

/**
 * R4 H-r4 — the local mirror of `assert_currency_decimals_safe`
 * (`0012_transaction_scale_and_category_kind.sql`, C1). See the file header
 * for why this scans a different set of rows than the live-reference count
 * above: every account regardless of `archived`, every non-deleted
 * transaction's own money columns, and every transaction line regardless of
 * its own parent's `deleted_at`.
 */
function anyStoredFigureOverScale(
  tx: ReplicaTx,
  code: UpdateCurrencyInput["code"],
  decimals: number,
): boolean {
  const over = (value: string | null): boolean =>
    value !== null && money.dec(value).decimalPlaces() > decimals;

  const accountRows = tx
    .select({ openingBalance: accounts.openingBalance, expectedBalance: accounts.expectedBalance })
    .from(accounts)
    .where(eq(accounts.currency, code))
    .all();
  if (accountRows.some((row) => over(row.openingBalance) || over(row.expectedBalance))) {
    return true;
  }

  // M1 — no `isNull(transactions.deletedAt)` filter: a soft-deleted row can
  // be restored later, and a scan that only sees live rows would let that
  // restore walk a figure past the guarantee with nothing left to catch it
  // (the mirror of `assert_currency_decimals_safe`'s own C1 fix). The
  // currency predicate is pushed into the `where` (L8) rather than filtered
  // in JS afterwards — the same three columns Postgres's own scan checks.
  const transactionRows = tx
    .select({
      currency: transactions.currency,
      amountOriginal: transactions.amountOriginal,
      fee: transactions.fee,
      toCurrency: transactions.toCurrency,
      toAmount: transactions.toAmount,
      debtCurrency: transactions.debtCurrency,
      debtAmount: transactions.debtAmount,
    })
    .from(transactions)
    .where(
      or(
        eq(transactions.currency, code),
        eq(transactions.toCurrency, code),
        eq(transactions.debtCurrency, code),
      ),
    )
    .all();
  for (const row of transactionRows) {
    if (row.currency === code && (over(row.amountOriginal) || over(row.fee))) return true;
    if (row.toCurrency === code && over(row.toAmount)) return true;
    if (row.debtCurrency === code && over(row.debtAmount)) return true;
  }

  const lineRows = tx
    .select({ amount: transactionLines.amount, currency: transactions.currency })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(eq(transactions.currency, code))
    .all();
  if (lineRows.some((row) => over(row.amount))) return true;

  // H3 — `recurring_transactions.amount_original` (its own `currency`) was
  // missing from this scan entirely: the phone admitted a shrink Postgres's
  // own `assert_currency_decimals_safe` already refuses for this table.
  const recurringRows = tx
    .select({ amountOriginal: recurringTransactions.amountOriginal })
    .from(recurringTransactions)
    .where(eq(recurringTransactions.currency, code))
    .all();
  return recurringRows.some((row) => over(row.amountOriginal));
}
