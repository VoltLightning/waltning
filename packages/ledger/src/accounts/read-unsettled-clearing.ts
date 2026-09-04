/**
 * §8's `find_unsettled`, FIFO half included. Class **F** for the balance
 * (`computations.md` §0) — this reuses the per-account balances
 * `readAccountsForNetWorth` already folds for §2/§3, filtered to
 * `kind = 'clearing'`, and asks `money.unsettledClearing` which of them are
 * non-zero.
 *
 * **Naming the oldest unconsumed transaction is `money.fifoOldestOpen`'s
 * job, run here over each unsettled account's own legs.** §0's class-**S**
 * line names the *largest-remainder split* (J08's allocation), never this
 * pointer — the replica holds the whole history the same way it does for
 * §7's ageing, so this stays on the phone rather than waiting on a server
 * round trip the banner (S04 §3) cannot afford.
 */

import type { AccountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { and, inArray, isNull, or } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { readAccountsForNetWorth } from "./read-accounts.ts";

const { transactions } = ledgerSchema;

export type LocalUnsettledClearing = money.ClearingAccountRow & {
  /** `find_unsettled`'s third field (§8) — `null` only if it cannot happen: a non-zero balance always has an oldest open leg. */
  oldestUnconsumedTransactionId: Id<"transactions"> | null;
  oldestDate: AccountingDate | null;
  /** The oldest leg's payee, for the banner to name a transaction rather than a number (S04 §3) — `""` reads as "no payee recorded", same as `LocalRecentTransaction`. */
  oldestUnconsumedPayee: string | null;
};

export function readUnsettledClearing<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalUnsettledClearing[] {
  const clearing = readAccountsForNetWorth(db)
    .filter((account) => account.kind === "clearing")
    .map(({ id, name, currency, decimals, balance }) => ({
      accountId: id,
      name,
      currency,
      decimals,
      balance,
    }));
  const unsettled = money.unsettledClearing(clearing);
  if (unsettled.length === 0) return [];

  // `money.ClearingAccountRow.accountId` is a plain `string` — `money.ts`
  // never imports the id brand. Re-branded here, where the row rejoins the
  // schema's own typed columns.
  const accountIds = unsettled.map((account) => id<"accounts">(account.accountId));
  const legs = db
    .select({
      id: transactions.id,
      date: transactions.date,
      payee: transactions.payee,
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
        or(
          inArray(transactions.accountId, accountIds),
          inArray(transactions.toAccountId, accountIds),
        ),
      ),
    )
    .all();

  return unsettled.map((account) => {
    const ownLegs = legs.filter(
      (leg) => leg.accountId === account.accountId || leg.toAccountId === account.accountId,
    );
    const deltas: money.FifoDelta<Id<"transactions">>[] = ownLegs.map((leg) => ({
      id: leg.id,
      date: leg.date,
      // §8's reading: this account's own side of the leg — inflows open,
      // outflows consume, the same rule `accountBalance` folds over both
      // legs with.
      delta: money.signed(leg, leg.accountId === account.accountId ? "from" : "to"),
    }));
    const oldest = money.fifoOldestOpen(deltas);
    const oldestLeg = oldest ? ownLegs.find((leg) => leg.id === oldest.id) : undefined;
    return {
      ...account,
      oldestUnconsumedTransactionId: oldest?.id ?? null,
      oldestDate: oldest?.date ?? null,
      oldestUnconsumedPayee: oldestLeg?.payee ?? null,
    };
  });
}
