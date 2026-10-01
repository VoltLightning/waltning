/**
 * A person's opening debts (§6.6), read back — S13's *existing debt* line, the
 * form's prefill when one is recorded again, and what the delete confirmation
 * lists. At most one live row per currency
 * (`opening_debts_counterparty_currency_uq`), so the list is as long as the
 * currencies the person has an existing debt in.
 *
 * **Each debt carries its repayments** — the live settlements that drew on it
 * (`transactions.settles_opening_debt_id`), with the account each one moved —
 * because the person is entitled to know what recording the debt again does to
 * what has already been repaid, and what deleting it takes with it.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema, type ReplicaTx } from "../schema-map.ts";

const { accounts, openingDebts, transactions } = ledgerSchema;

/** One repayment made against an opening debt. */
export type LocalOpeningRepayment = {
  id: Id<"transactions">;
  accountId: Id<"accounts">;
  accountName: string;
  /** What it discharged, in the debt's own currency. */
  amount: Money;
  /** What changed hands, in the account's currency. */
  accountAmount: Money;
  accountCurrency: CurrencyCode;
};

export type LocalOpeningDebt = {
  id: Id<"openingDebts">;
  counterpartyId: Id<"counterparties">;
  currency: CurrencyCode;
  direction: "theyOwe" | "youOwe";
  amount: Money;
  date: AccountingDate;
  /** Σ of what the repayments discharged, in the debt's currency. */
  repaid: Money;
  repayments: readonly LocalOpeningRepayment[];
};

const repaymentColumns = {
  id: transactions.id,
  openingDebtId: transactions.settlesOpeningDebtId,
  accountId: transactions.accountId,
  accountName: accounts.name,
  accountAmount: transactions.amountOriginal,
  accountCurrency: transactions.currency,
  debtAmount: transactions.debtAmount,
};

type RepaymentRow = {
  id: Id<"transactions">;
  openingDebtId: Id<"openingDebts"> | null;
  accountId: Id<"accounts">;
  accountName: string;
  accountAmount: Money;
  accountCurrency: CurrencyCode;
  debtAmount: Money | null;
};

function toRepayment(row: RepaymentRow): LocalOpeningRepayment {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    amount: row.debtAmount ?? row.accountAmount,
    accountAmount: row.accountAmount,
    accountCurrency: row.accountCurrency,
  };
}

/** The live repayments of one opening debt — the write's own read, inside its transaction. */
export function readOpeningRepayments(
  tx: ReplicaTx,
  openingDebtId: Id<"openingDebts">,
): readonly LocalOpeningRepayment[] {
  return tx
    .select(repaymentColumns)
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(eq(transactions.settlesOpeningDebtId, openingDebtId), isNull(transactions.deletedAt)),
    )
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all()
    .map(toRepayment);
}

export function readOpeningDebts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  counterpartyId: Id<"counterparties">,
): readonly LocalOpeningDebt[] {
  const debts = db
    .select({
      id: openingDebts.id,
      counterpartyId: openingDebts.counterpartyId,
      currency: openingDebts.currency,
      direction: openingDebts.direction,
      amount: openingDebts.amount,
      date: openingDebts.date,
    })
    .from(openingDebts)
    .where(and(eq(openingDebts.counterpartyId, counterpartyId), isNull(openingDebts.deletedAt)))
    .orderBy(asc(openingDebts.currency))
    .all();
  if (debts.length === 0) return [];

  const repayments = db
    .select(repaymentColumns)
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        inArray(
          transactions.settlesOpeningDebtId,
          debts.map((debt) => debt.id),
        ),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();

  return debts.map((debt) => {
    const mine = repayments.filter((row) => row.openingDebtId === debt.id).map(toRepayment);
    return {
      ...debt,
      repaid: mine.reduce((sum, row) => money.add(sum, row.amount), money.ZERO),
      repayments: mine,
    };
  });
}
