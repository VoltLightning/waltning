/**
 * A person's opening debts (§6.6), read back — S13's *existing debt* line and
 * the form's own prefill when one is recorded again. At most one row per
 * currency (`opening_debts_counterparty_currency_uq`), so the list is as long
 * as the currencies the person has an existing debt in.
 */

import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { openingDebts } = ledgerSchema;

export type LocalOpeningDebt = {
  id: Id<"openingDebts">;
  counterpartyId: Id<"counterparties">;
  currency: CurrencyCode;
  direction: "theyOwe" | "youOwe";
  amount: Money;
  date: AccountingDate;
};

export function readOpeningDebts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  counterpartyId: Id<"counterparties">,
): readonly LocalOpeningDebt[] {
  return db
    .select({
      id: openingDebts.id,
      counterpartyId: openingDebts.counterpartyId,
      currency: openingDebts.currency,
      direction: openingDebts.direction,
      amount: openingDebts.amount,
      date: openingDebts.date,
    })
    .from(openingDebts)
    .where(eq(openingDebts.counterpartyId, counterpartyId))
    .orderBy(asc(openingDebts.currency))
    .all();
}
