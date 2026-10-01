/**
 * `record_opening_debt`, on the device — §6.6's debt that predates the ledger,
 * entered on the person's page: *they owe you* or *you owe them*, an amount, a
 * currency and the day it dates from.
 *
 * **It writes `opening_debts`, never `transactions`.** A transaction carries
 * an account, and an account's balance and every period figure are built from
 * transactions, so a debt that was already there before the books began would
 * either move an account that never saw the money or count as income or
 * spending that never happened. A row of its own reaches exactly one figure —
 * the person's balance (`read-counterparty-balances.ts` folds it in as a lend
 * or a borrow) — and from there `settle_debt` sees it as any other open debt.
 * There is no category to refuse because there is nothing for one to attach
 * to; the table has no such column.
 *
 * **One live row per person per currency; recording again replaces it.** The
 * row keeps the id it was first written with — a correction is the same write
 * with the right figure, not a second debt — and the repayments already made
 * against it stay attached. That is also why the result carries the balance
 * and `flipped`: a smaller figure under a larger repayment points the debt the
 * other way, and the caller says so before it saves.
 *
 * **Refused here, beneath the contract schema and above the table's own
 * CHECKs:** a person the replica does not hold (a dependency — a later sync
 * may bring them), an archived person, a figure past its currency's declared
 * scale, a figure past the amount ceiling, an unknown currency, and (in the
 * contract) a date later than the device's own day.
 */

import * as money from "@waltning/core/money";
import { recordOpeningDebtInput } from "@waltning/core/registry/inputs";
import { and, eq, isNull } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import { replanOpeningLinks } from "./opening-link.ts";
import { balancesForCounterparty } from "./read-counterparty-balances.ts";
import { readOpeningRepayments } from "./read-opening-debts.ts";

const { counterparties, currencies, openingDebts } = schema;

/** The row as the replica holds it — every column. */
export type LocalOpeningDebtRow = typeof openingDebts.$inferSelect;

/**
 * What the write did, and what it did to the person's balance — returned the
 * way `settle_debt` returns its residual. `flipped`: the balance now points
 * the other way from the direction just recorded (more was repaid than the new
 * figure). `repaid`: what the repayments so far have discharged.
 */
export type RecordOpeningDebtResult = {
  row: LocalOpeningDebtRow;
  balance: money.Money;
  repaid: money.Money;
  flipped: boolean;
};

export const recordOpeningDebtExecutor = defineLocalExecutor<
  typeof recordOpeningDebtInput,
  RecordOpeningDebtResult,
  ReplicaTx
>({
  operation: "record_opening_debt",
  opVersion: 1,
  input: recordOpeningDebtInput,
  /** One id: the row's own — kept when a row for this person and currency already exists. */
  mints: (input) => [input.id],
  // Read-only, run before the outbox commits: a figure past its currency's
  // scale (or the ceiling) is refused, never queued as an intent nothing
  // will ever apply.
  validate: (input, tx) => {
    assertMoneyScale(tx, input.amount, input.currency, "record_opening_debt: amount");
  },
  apply: (input, tx) => {
    const [counterparty] = tx
      .select({ id: counterparties.id, archived: counterparties.archived })
      .from(counterparties)
      .where(eq(counterparties.id, input.counterpartyId))
      .all();
    if (!counterparty) {
      throw new LocalRefusal(`record_opening_debt: no counterparty ${input.counterpartyId}`, {
        dependency: true,
      });
    }
    // An archived person is out of the pickers and cannot be settled with; a
    // debt entered on one would be invisible from then on.
    if (counterparty.archived) {
      throw new LocalRefusal(
        `record_opening_debt: ${input.counterpartyId} is archived — an existing debt is entered on a live person`,
      );
    }

    const [currency] = tx
      .select({ code: currencies.code, decimals: currencies.decimals })
      .from(currencies)
      .where(eq(currencies.code, input.currency))
      .all();
    if (!currency) {
      throw new LocalRefusal(`record_opening_debt: no currency ${input.currency}`, {
        column: "currency",
      });
    }

    const fields = {
      direction: input.direction,
      amount: input.amount,
      date: input.date,
    };
    const [existing] = tx
      .select({ id: openingDebts.id })
      .from(openingDebts)
      .where(
        and(
          eq(openingDebts.counterpartyId, input.counterpartyId),
          eq(openingDebts.currency, input.currency),
          isNull(openingDebts.deletedAt),
        ),
      )
      .all();

    const [row] = existing
      ? tx
          .update(openingDebts)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(openingDebts.id, existing.id))
          .returning()
          .all()
      : tx
          .insert(openingDebts)
          .values({
            id: input.id,
            counterpartyId: input.counterpartyId,
            currency: input.currency,
            ...fields,
          })
          .returning()
          .all();

    if (!row) {
      throw new Error("record_opening_debt: the replica write returned no row");
    }
    // **A re-recorded debt re-plans the repayments linked to it** (§6.6): a
    // smaller figure leaves some of them past its end, and the other direction
    // means they no longer reduce it. They are re-decided by the rule a new
    // settlement meets, and whatever no longer fits is unlinked.
    if (existing !== undefined) replanOpeningLinks(tx, [row.id], row.id);

    // What this did to the balance (and to the repayments already made against
    // the row it replaced): read back, never derived from the input.
    const balance =
      balancesForCounterparty(tx, input.counterpartyId).find(
        (entry) => entry.currency === input.currency,
      )?.balance ?? money.ZERO;
    const sign = money.cmp(money.round(balance, currency.decimals), money.ZERO);
    const flipped = sign !== 0 && sign !== (input.direction === "theyOwe" ? 1 : -1);
    const repaid = readOpeningRepayments(tx, row.id).reduce(
      (sum, repayment) => money.add(sum, repayment.amount),
      money.ZERO,
    );
    return { row, balance, repaid, flipped };
  },
});
