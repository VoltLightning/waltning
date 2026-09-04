/**
 * `settle_debt`, on the device — `architecture/08` H9's whole resolution,
 * S14 §5.
 *
 * **Takes the amount that changed hands and the debt it discharges — never
 * the residual.** The residual is derived here, from the live replica, and
 * returned; a stale client figure never overwrites a balance that moved.
 * S14 §5: *"a settlement never implicitly clears a balance"* — the remainder
 * always lands somewhere, even when that somewhere is a flipped sign
 * (over-settlement, S14 §9.2 — never refused, only stated).
 *
 * **Direction is read off the live balance's sign, never supplied.**
 * Positive — *they owe you* — settles as an `income` into `accountId`;
 * negative — *you owe them* — settles as an `expense` from it. §6.6's four
 * cases collapse to this one rule because the debt sign and the cash
 * direction are always opposite.
 *
 * `insertTransaction` (`transactions/create-transaction.executor.ts`) is the
 * one write path for the table — this mints a row through it rather than a
 * second `tx.insert(transactions)`, the same reason `reconcile_account` and
 * `supersede_transaction` do.
 */

import * as money from "@waltning/core/money";
import {
  createTransactionInput,
  type SettleDebtInput,
  settleDebtInput,
} from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import {
  insertTransaction,
  type LocalTransactionRow,
} from "../transactions/create-transaction.executor.ts";
import type { LocalTx } from "../write.ts";
import { openBalances } from "./open-balances.ts";

const { counterparties } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export type SettleDebtResult = {
  row: LocalTransactionRow;
  /** What remains outstanding, in `discharges.currency`, after this write. */
  residual: money.Money;
  /** The balance's sign flipped — paid more than was owed (S14 §9.2). */
  overSettled: boolean;
};

export const settleDebtExecutor = defineLocalExecutor<
  typeof settleDebtInput,
  SettleDebtResult,
  ReplicaTx
>({
  operation: "settle_debt",
  opVersion: 1,
  input: settleDebtInput,
  /** One id: the settlement transaction's own — never the counterparty's. */
  mints: (input) => [input.id],
  apply: (input, tx) => settleDebt(input, tx),
});

function settleDebt(input: SettleDebtInput, tx: ReplicaTx): SettleDebtResult {
  const [counterparty] = tx
    .select({ name: counterparties.name })
    .from(counterparties)
    .where(eq(counterparties.id, input.counterpartyId))
    .all();
  if (!counterparty) {
    throw new Error(`settle_debt: no counterparty ${input.counterpartyId}`);
  }

  const before = openBalances(tx, input.counterpartyId).find(
    (row) => row.currency === input.discharges.currency,
  );
  const balanceBefore = before?.balance ?? money.ZERO;
  const sign = money.cmp(balanceBefore, money.ZERO);

  if (sign === 0) {
    throw new Error(`settle_debt: nothing to settle in ${input.discharges.currency}`);
  }

  // §6.6's four cases, collapsed: they owe you (positive) → money flows in;
  // you owe them (negative) → money flows out. The two are always opposite.
  const type = sign > 0 ? ("income" as const) : ("expense" as const);

  const row = insertTransaction(
    createTransactionInput.parse({
      id: input.id,
      date: input.date,
      type,
      accountId: input.accountId,
      amountOriginal: input.amount,
      currency: input.currency,
      counterpartyId: input.counterpartyId,
      counterpartyRole: "debt",
      payee: counterparty.name,
      note: input.note,
      source: "manual",
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    }),
    tx,
  );

  // `debt_currency`/`debt_amount` are not on `createTransactionInput` (the
  // ordinary capture path never sets them — see its own "not here, on
  // purpose" note); `settle_debt` is the one write that does, so it stamps
  // them directly rather than widening that schema for a single caller.
  const [stamped] = tx
    .update(schema.transactions)
    .set({ debtCurrency: input.discharges.currency, debtAmount: input.discharges.amount })
    .where(eq(schema.transactions.id, row.id))
    .returning()
    .all();
  if (!stamped) {
    throw new Error("settle_debt: the row changed between insert and the debt-fields update");
  }

  const after = openBalances(tx, input.counterpartyId).find(
    (r) => r.currency === input.discharges.currency,
  );
  const residual = after?.balance ?? money.ZERO;
  const residualSign = money.cmp(residual, money.ZERO);
  const overSettled = residualSign !== 0 && residualSign !== sign;

  return { row: stamped, residual, overSettled };
}
