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
 * **One row per person per currency; recording again replaces it.** The row
 * keeps the id it was first written with — a correction is the same write
 * with the right figure, not a second debt. `opening_debts_counterparty_currency_uq`
 * is the guarantee; the lookup here is what makes the write an upsert rather
 * than a collision.
 *
 * **Refused here, beneath the contract schema and above the table's own
 * CHECKs:** a person the replica does not hold (a dependency — a later sync
 * may bring them), a figure past its currency's declared scale, a figure past
 * the amount ceiling, and an unknown currency.
 */

import { recordOpeningDebtInput } from "@waltning/core/registry/inputs";
import { and, eq } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { counterparties, currencies, openingDebts } = schema;

/** The row as the replica holds it — every column. */
export type LocalOpeningDebtRow = typeof openingDebts.$inferSelect;

export const recordOpeningDebtExecutor = defineLocalExecutor<
  typeof recordOpeningDebtInput,
  LocalOpeningDebtRow,
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
      .select({ id: counterparties.id })
      .from(counterparties)
      .where(eq(counterparties.id, input.counterpartyId))
      .all();
    if (!counterparty) {
      throw new LocalRefusal(`record_opening_debt: no counterparty ${input.counterpartyId}`, {
        dependency: true,
      });
    }

    const [currency] = tx
      .select({ code: currencies.code })
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
    return row;
  },
});
