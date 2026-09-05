/**
 * §8's `find_unsettled`, FIFO half included. Class **F** for the balance
 * (`computations.md` §0) — this reuses the per-account balances
 * `readAccounts` already folds for §2/§3, restricted to `kind: 'clearing'`
 * in the query itself (M3 — `readAccounts` used to fold every account's
 * legs and filter to clearing only afterward), and asks
 * `money.unsettledClearing` which of them are non-zero.
 *
 * **Archived is not filtered out here (M1) — read with `includeArchived:
 * true`, the same rule `read-counterparty-balances.ts` applies.** A clearing
 * account archived while still carrying an unallocated balance is still a
 * prompt (§6.4); `money.unsettledClearing`'s own zero-balance filter is what
 * keeps an archived, settled clearing account off the banner, exactly as it
 * already does for one that was never archived.
 *
 * **Naming the oldest unconsumed transaction is `money.fifoOldestOpen`'s
 * job, run here over each unsettled account's own legs, PLUS its opening
 * balance (H2).** §0's class-**S** line names the *largest-remainder split*
 * (J08's allocation), never this pointer — the replica holds the whole
 * history the same way it does for §7's ageing, so this stays on the phone
 * rather than waiting on a server round trip the banner (S04 §3) cannot
 * afford.
 *
 * **The opening balance is seeded as its own FIFO entry, dated
 * `openingDate`, `id: null`.** Omitting it (as this file used to) let the
 * balance and the FIFO queue disagree the moment an account opened with a
 * non-zero figure: the balance included it, the queue did not, so the queue
 * could report "nothing open" — or the wrong oldest row — while the account
 * still showed money unaccounted for. `id: null` is deliberate: this entry
 * is not a transaction, so it can never be "named" the way a real leg is —
 * `oldestUnconsumedTransactionId` and `oldestUnconsumedPayee` both read
 * `null` when it wins, and the banner says so (`shell.unsettledOpening`)
 * rather than falling back to a payee that does not exist.
 */

import type { AccountingDate } from "@waltning/core/date";
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import type { Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { and, inArray, isNull, or } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { readAccounts } from "./read-accounts.ts";

const { transactions } = ledgerSchema;

/**
 * No account predates this: an opening balance with no `openingDate` set
 * still has to sort *somewhere* in the FIFO queue, and "before every real
 * transaction" is the only reading consistent with "this was already there."
 */
const OPENING_DATE_FALLBACK = accountingDate("0001-01-01");

export type LocalUnsettledClearing = money.ClearingAccountRow & {
  /** `find_unsettled`'s third field (§8) — `null` when the oldest unconsumed entry is the account's own opening balance, not a transaction (H2). */
  oldestUnconsumedTransactionId: Id<"transactions"> | null;
  oldestDate: AccountingDate | null;
  /** The oldest entry's own unconsumed magnitude — may be less than `balance` when more than one entry is still open (H3). `null` only alongside a zero balance, which `money.unsettledClearing` already filters out. */
  oldestUnconsumedRemainder: Money | null;
  /** The oldest leg's payee, for the banner to name a transaction rather than a number (S04 §3) — `""` reads as "no payee recorded", `null` when the oldest entry is the opening balance (no leg to have one). */
  oldestUnconsumedPayee: string | null;
};

export function readUnsettledClearing<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalUnsettledClearing[] {
  const clearingAccounts = readAccounts(db, { includeArchived: true, kind: "clearing" });
  const clearing = clearingAccounts.map(({ id, name, currency, decimals, balance }) => ({
    accountId: id,
    name,
    currency,
    decimals,
    balance,
  }));
  const unsettled = money.unsettledClearing(clearing);
  if (unsettled.length === 0) return [];

  const openingByAccount = new Map(
    clearingAccounts.map((account) => [
      account.id,
      { openingBalance: account.openingBalance, openingDate: account.openingDate },
    ]),
  );

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
    const accountId = id<"accounts">(account.accountId);
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
    const opening = openingByAccount.get(accountId);
    if (opening && !money.isZero(opening.openingBalance)) {
      deltas.push({
        id: null,
        date: opening.openingDate ?? OPENING_DATE_FALLBACK,
        delta: opening.openingBalance,
      });
    }
    const oldest = money.fifoOldestOpen(deltas);
    const oldestLeg = oldest?.id != null ? ownLegs.find((leg) => leg.id === oldest.id) : undefined;
    return {
      ...account,
      oldestUnconsumedTransactionId: oldest?.id ?? null,
      oldestDate: oldest?.date ?? null,
      oldestUnconsumedRemainder: oldest?.remainder ?? null,
      oldestUnconsumedPayee: oldestLeg?.payee ?? null,
    };
  });
}
