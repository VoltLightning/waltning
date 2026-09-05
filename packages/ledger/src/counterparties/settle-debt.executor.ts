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
 * **Direction is always read off the live balance's sign here; `input.type`
 * is verified against it, never trusted outright (R2 H4).** §6.6's four
 * cases collapse to one rule — they owe you (positive) → money flows in as
 * `income`; you owe them (negative) → money flows out as `expense`, the sign
 * and the cash direction always opposite. The controller reads the sign when
 * it builds the payload and names it as `input.type`, and a disagreement
 * with the live read here means *the balance moved — reload*, not a silent
 * flip — the phone's own outbox can apply a dependent write out of order, so
 * the direction shown and the direction actually taken could otherwise
 * disagree silently. Required, not optional (#116 review, M2): an omitted
 * `type` skipped this verification for exactly the caller least likely to
 * have re-derived it independently.
 *
 * **Refuses a currency that contradicts the account (R2 H3).** §6.5:
 * *a transaction's currency is its account's currency* — Postgres enforces it
 * with a trigger the phone has no equivalent of, so nothing caught
 * `settle_debt` writing an EUR row into a PLN account until drain. Checked
 * here, before `insertTransaction` ever runs.
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
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import {
  insertTransaction,
  type LocalTransactionRow,
} from "../transactions/create-transaction.executor.ts";
import type { LocalTx } from "../write.ts";
import { balancesForCounterparty } from "./read-counterparty-balances.ts";

const { accounts, counterparties, currencies } = schema;
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
    throw new LocalRefusal(`settle_debt: no counterparty ${input.counterpartyId}`, {
      dependency: true,
    });
  }

  // R2 H3 — §6.5: a transaction's currency is its account's currency.
  // Postgres has a trigger for this; the phone has none, so `settle_debt`
  // checks it directly rather than writing a row drain would refuse later.
  const [account] = tx
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .all();
  if (!account) {
    throw new LocalRefusal(`settle_debt: no account ${input.accountId}`, { dependency: true });
  }
  if (account.currency !== input.currency) {
    throw new LocalRefusal(
      `settle_debt: currency ${input.currency} does not match account currency ` +
        `${account.currency} (account ${input.accountId})`,
    );
  }

  // L1 — the currency's own decimals, read here rather than trusted from a
  // caller: `balancesForCounterparty` folds at full 8dp precision, and both
  // signs below must agree with `settleResidualDirection`'s own rounded read
  // of the same figures, or the executor and the screen can each name a
  // different outcome for the same settlement.
  const [currencyRow] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, input.discharges.currency))
    .all();
  if (!currencyRow) {
    throw new LocalRefusal(`settle_debt: no currency ${input.discharges.currency}`, {
      dependency: true,
    });
  }
  const decimals = currencyRow.decimals;

  const before = balancesForCounterparty(tx, input.counterpartyId).find(
    (row) => row.currency === input.discharges.currency,
  );
  const balanceBefore = before?.balance ?? money.ZERO;
  const sign = money.cmp(money.round(balanceBefore, decimals), money.ZERO);

  if (sign === 0) {
    throw new LocalRefusal(`settle_debt: nothing to settle in ${input.discharges.currency}`);
  }

  // R2 H4 — §6.6's four cases, collapsed: they owe you (positive) → money
  // flows in as `income`; you owe them (negative) → money flows out as
  // `expense`. `input.type` is the controller's own read of this sign, taken
  // when the sheet built the payload; verified against the live sign rather
  // than trusted, and never silently overridden — a disagreement means the
  // balance moved since the sheet was shown. #116 review, M2: required, not
  // optional — an omitted `type` skipped this verification entirely for the
  // one caller least likely to have re-derived it.
  const liveType = sign > 0 ? ("income" as const) : ("expense" as const);
  if (input.type !== liveType) {
    throw new LocalRefusal(
      `settle_debt: expected ${input.type} but the live balance in ` +
        `${input.discharges.currency} now settles as ${liveType} — the balance moved, reload`,
    );
  }

  const row = insertTransaction(
    createTransactionInput.parse({
      id: input.id,
      date: input.date,
      type: liveType,
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

  const after = balancesForCounterparty(tx, input.counterpartyId).find(
    (r) => r.currency === input.discharges.currency,
  );
  const residual = after?.balance ?? money.ZERO;
  const residualSign = money.cmp(money.round(residual, decimals), money.ZERO);
  const overSettled = residualSign !== 0 && residualSign !== sign;

  return { row: stamped, residual, overSettled };
}
