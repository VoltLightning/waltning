/**
 * `reconcile_account` — S16 §5, *"I counted, and it says this."*
 *
 * Writes **one `adjustment` transaction** for `observed − computed`, dated
 * `asOf`, and records the observation in `accounts.expected_balance`. Never a
 * balance overwrite: the balance is `opening + Σ signed legs`
 * (`computations.md` §2) and there is no field to set. The discrepancy stays
 * visible as an amount you can categorise later, exactly the way any other
 * transaction does.
 *
 * `computed` is §2 **as of `asOf`** — rows dated after the observation do not
 * count, or reconciling yesterday's statement would absorb today's coffee.
 *
 * **The fold is inlined here, not imported.** A1 (`packages/core/src/money.ts`
 * gaining `accountBalance(openingBalance, accountId, rows)`) had not merged
 * when this was written. `money.signed` already exists and is what both
 * folds are built from — `read-accounts.ts`'s inline loop is the same shape —
 * so this is the fold `accountBalance` will replace, not a second design for
 * it. When A1 lands, `computedBalance` below collapses to one call.
 */

import type { AccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import {
  createTransactionInput,
  type ReconcileAccountInput,
  reconcileAccountInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import {
  insertTransaction,
  type LocalTransactionRow,
} from "../transactions/create-transaction.executor.ts";
import type { LocalTx } from "../write.ts";

const { accounts, transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const reconcileAccountExecutor = defineLocalExecutor<
  typeof reconcileAccountInput,
  LocalTransactionRow,
  ReplicaTx
>({
  operation: "reconcile_account",
  opVersion: 1,
  input: reconcileAccountInput,
  /** The adjustment is the one row this write brings into existence. */
  mints: (input) => [input.adjustmentId],
  apply: (input, tx) => reconcileAccount(input, tx),
});

function reconcileAccount(input: ReconcileAccountInput, tx: ReplicaTx): LocalTransactionRow {
  const [account] = tx.select().from(accounts).where(eq(accounts.id, input.accountId)).all();
  if (!account) {
    throw new Error(`reconcile_account: no account ${input.accountId}`);
  }
  if (account.archived) {
    throw new Error(`reconcile_account: ${input.accountId} is archived`);
  }

  const computed = computedBalance(account.id, account.openingBalance, input.asOf, tx);
  const difference = money.sub(input.observedBalance, computed);

  if (money.isZero(difference)) {
    throw new Error(
      `reconcile_account: nothing to reconcile — the ledger already says ${input.observedBalance}`,
    );
  }

  const adjustment = createTransactionInput.parse({
    id: input.adjustmentId,
    date: input.asOf,
    type: "adjustment",
    accountId: input.accountId,
    // May be negative — H5's whole point. `zMoney` accepts the sign;
    // `createTransactionInput`'s amount-positive check exempts `adjustment`.
    amountOriginal: difference,
    currency: account.currency,
    note: input.note,
    source: "manual",
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
  });
  const adjustmentRow = insertTransaction(adjustment, tx);

  const [updatedAccount] = tx
    .update(accounts)
    .set({
      expectedBalance: input.observedBalance,
      version: sql`${accounts.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id))
    .returning()
    .all();
  if (!updatedAccount) {
    throw new Error("reconcile_account: the account row changed between read and write");
  }

  return adjustmentRow;
}

/**
 * `opening_balance + Σ signed legs`, dated on or before `asOf` — the fold
 * `read-accounts.ts` runs for every active account, narrowed to one account
 * and one cutoff date. See the file header for why this is inlined rather
 * than imported.
 */
function computedBalance(
  accountId: typeof accounts.$inferSelect.id,
  openingBalance: money.Money,
  asOf: AccountingDate,
  tx: ReplicaTx,
): money.Money {
  const rows = tx
    .select({
      type: transactions.type,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        lte(transactions.date, asOf),
        or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)),
      ),
    )
    .all();

  let balance = openingBalance;
  for (const row of rows) {
    if (row.accountId === accountId) {
      balance = money.add(balance, money.signed(row, "from"));
    }
    if (row.toAccountId === accountId) {
      balance = money.add(balance, money.signed(row, "to"));
    }
  }
  return balance;
}
