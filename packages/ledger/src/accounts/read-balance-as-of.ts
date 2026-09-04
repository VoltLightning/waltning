/**
 * `opening_balance + Σ signed legs`, dated on or before `asOf` — §2's fold,
 * the same one `reconcile_account`'s executor computes to decide the
 * difference it writes. `ReconcileSheet`'s own "Computed" figure showed the
 * account's *current* balance regardless of the chosen date until this read
 * existed; this is what lets it show the same number the write will actually
 * use.
 *
 * `AccountingDate` is a bare `YYYY-MM-DD` string (§7.0a) — `lte` on it is a
 * plain string comparison, which sorts correctly for that format without
 * ever constructing a `Date`.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, transactions } = ledgerSchema;

export function readBalanceAsOf<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  accountId: Id<"accounts">,
  asOf: AccountingDate,
): money.Money {
  const [account] = db.select().from(accounts).where(eq(accounts.id, accountId)).all();
  if (!account) {
    throw new Error(`readBalanceAsOf: no account ${accountId}`);
  }

  const rows = db
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

  return money.accountBalance(account.openingBalance, accountId, rows);
}
