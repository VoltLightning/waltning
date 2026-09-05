/**
 * `readTransaction` — S09's whole subject, one query.
 *
 * **Everything `TransactionHero` and `FieldsCard` need, joined once**: the
 * row itself, plus the account and category names a form shows a person
 * rather than an id, plus `version` — the token every write on this screen
 * carries back (`architecture/14` §14.2). A second query per field would
 * mean five round trips for one screen; this is the one place they meet.
 *
 * **Lines are a second query, not a join.** A transaction with no breakdown
 * — the ordinary case (§10.3) — would otherwise turn a one-row join into a
 * padded result the caller has to de-duplicate back down; two queries stay
 * simple in both directions.
 *
 * **`FxAmount`'s full basis, the receipt card, and the audit history are not
 * read here.** `wave-3-shared.md` names all three as unbuilt this wave — no
 * rate table (`#e3`), no receipts, no audit log on the phone — so this
 * mirrors exactly the columns `TransactionHero`, `FieldsCard` and
 * `LinesCard` render, not every column `transactions` carries.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { TxnType } from "@waltning/schema/enums";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, categories, currencies, transactionLines, transactions } = ledgerSchema;

export type LocalTransactionLine = {
  id: Id<"transactionLines">;
  description: string;
  amount: Money;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
  sort: number;
};

export type LocalTransactionDetail = {
  id: Id<"transactions">;
  date: AccountingDate;
  type: TxnType;
  payee: string;
  note: string;
  isBusiness: boolean;
  accountId: Id<"accounts">;
  accountName: string;
  categoryId: Id<"categories"> | null;
  categoryName: string | null;
  /** `SPEC.md` §14.4b — see `readRecent`'s identical field. */
  brandKey: string | null;
  /** Already signed, `money.signed` on the `"from"` leg — same rule as `readRecent`. */
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  version: number;
  lines: readonly LocalTransactionLine[];
};

/**
 * `null` for a row that does not exist or is soft-deleted (§6.9) — the same
 * "not there" a caller gets for either, because a screen showing a deleted
 * row's fields would be showing the one thing `deleted_at` says stopped
 * being true.
 */
export function readTransaction<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  id: Id<"transactions">,
): LocalTransactionDetail | null {
  const row = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      payee: transactions.payee,
      note: transactions.note,
      isBusiness: transactions.isBusiness,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      brandKey: transactions.brandKey,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
      currency: transactions.currency,
      decimals: currencies.decimals,
      version: transactions.version,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(currencies, eq(transactions.currency, currencies.code))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();

  if (!row) return null;

  const lines = db
    .select({
      id: transactionLines.id,
      description: transactionLines.description,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      categoryName: categories.name,
      sort: transactionLines.sort,
    })
    .from(transactionLines)
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(eq(transactionLines.transactionId, id))
    .orderBy(asc(transactionLines.sort), asc(transactionLines.id))
    .all();

  const { type, amountOriginal, toAmount, ...rest } = row;
  return {
    ...rest,
    type,
    amount: money.signed({ type, amountOriginal, toAmount }, "from"),
    lines,
  };
}
