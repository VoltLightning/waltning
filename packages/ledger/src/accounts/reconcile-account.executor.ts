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
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
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
  // H2 — read-only, run before the outbox commits (`LocalExecutor.validate`'s
  // own doc): both `observedBalance` and the `difference` it derives are
  // refused past `account.currency`'s own scale the same way `reconcileAccount`
  // itself already does, never queued as an intent nothing will ever apply.
  // An unknown or archived account, and "nothing to reconcile", stay inside
  // `apply` — business refusals a future server might still resolve
  // differently, not the scale guarantee this checks.
  validate: (input, tx) => {
    const [account] = tx
      .select({
        currency: accounts.currency,
        openingBalance: accounts.openingBalance,
        archived: accounts.archived,
      })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .all();
    if (!account || account.archived) return;
    assertMoneyScale(
      tx,
      input.observedBalance,
      account.currency,
      "reconcile_account: expected_balance",
    );
    const computed = computedBalance(input.accountId, account.openingBalance, input.asOf, tx);
    const difference = money.sub(input.observedBalance, computed);
    if (money.isZero(difference)) return;
    assertMoneyScale(tx, difference, account.currency, "reconcile_account: adjustment amount");
  },
  apply: (input, tx) => reconcileAccount(input, tx),
});

function reconcileAccount(input: ReconcileAccountInput, tx: ReplicaTx): LocalTransactionRow {
  const [account] = tx.select().from(accounts).where(eq(accounts.id, input.accountId)).all();
  if (!account) {
    throw new LocalRefusal(`reconcile_account: no account ${input.accountId}`, {
      dependency: true,
    });
  }
  if (account.archived) {
    throw new LocalRefusal(`reconcile_account: ${input.accountId} is archived`);
  }

  // `SPEC.md` §7.2, the local mirror of `assert_account_balance_scale`
  // (`0012_transaction_scale_and_category_kind.sql`): checked against
  // `observedBalance` directly, not the *derived* `difference` below — a
  // difference can land back at a clean scale by coincidence (an over-scale
  // observation cancelling an equally over-scale `computed`), which would
  // let the same figure through to `accounts.expected_balance` unrefused.
  assertMoneyScale(
    tx,
    input.observedBalance,
    account.currency,
    "reconcile_account: expected_balance",
  );

  const computed = computedBalance(account.id, account.openingBalance, input.asOf, tx);
  const difference = money.sub(input.observedBalance, computed);

  if (money.isZero(difference)) {
    throw new LocalRefusal(
      `reconcile_account: nothing to reconcile — the ledger already says ${input.observedBalance}`,
    );
  }

  // `SPEC.md` §7.2 — `difference` is *derived*, never the validated
  // `observedBalance` above, so `insertTransaction` no longer checks its
  // scale for us (L10: that check now runs once, in `create_transaction`'s
  // own `validate`, not a second time inside every caller of
  // `insertTransaction`). This is that check, for the one value here that is
  // actually new.
  assertMoneyScale(tx, difference, account.currency, "reconcile_account: adjustment amount");

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
