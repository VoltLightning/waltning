/**
 * What an account is tied to — the one definition of "has entries".
 *
 * `delete_account` removes an account **no row has ever referenced** (§6.9),
 * and three readers need the same answer: the executor (to refuse with a good
 * message), `readAccounts` (so the editor offers *Delete* only where it will
 * work), and the two engines' triggers (`accounts_delete_guard`, WA022), which
 * state it a third time where the code cannot be wrong. They are kept to one
 * list of references here so a fourth table that starts pointing at accounts
 * is one line to add and one test that fails if it is forgotten.
 *
 * **Soft-deleted transactions count.** A deleted transaction is still a row
 * naming the account — the audit trail and the foreign key both keep it — so
 * an account whose only entry was deleted is archived, not removed.
 *
 * **An opening balance counts.** It is the money the account started with; an
 * account removed with one would take that money out of every total silently.
 */

import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { inArray, or } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, recurringTransactions, transactions } = ledgerSchema;

/**
 * Either the replica handle or a transaction on it — a reader and an executor
 * ask the same question, and only the first holds a branded `ReplicaDb`.
 */
type Reader<TRun, TSchema extends typeof ledgerSchema> = BaseSQLiteDatabase<"sync", TRun, TSchema>;

/** Why an account cannot be deleted; absent when nothing references it. */
export type AccountReference = "transactions" | "recurring" | "opening_balance";

/**
 * The ids, out of `ids`, that some row references — and the first reason found
 * for each. One query per referencing table, however many accounts are asked
 * about, because `readAccounts` asks about all of them at once.
 */
export function referencedAccounts<TRun, TSchema extends typeof ledgerSchema>(
  db: Reader<TRun, TSchema>,
  ids: readonly Id<"accounts">[],
): ReadonlyMap<Id<"accounts">, AccountReference> {
  const reasons = new Map<Id<"accounts">, AccountReference>();
  if (ids.length === 0) return reasons;
  const wanted = new Set<string>(ids);

  const note = (id: string | null, reason: AccountReference): void => {
    if (id !== null && wanted.has(id) && !reasons.has(id as Id<"accounts">)) {
      reasons.set(id as Id<"accounts">, reason);
    }
  };

  for (const row of db
    .select({ accountId: transactions.accountId, toAccountId: transactions.toAccountId })
    .from(transactions)
    .where(
      or(inArray(transactions.accountId, [...ids]), inArray(transactions.toAccountId, [...ids])),
    )
    .all()) {
    note(row.accountId, "transactions");
    note(row.toAccountId, "transactions");
  }

  for (const row of db
    .select({
      accountId: recurringTransactions.accountId,
      toAccountId: recurringTransactions.toAccountId,
    })
    .from(recurringTransactions)
    .where(
      or(
        inArray(recurringTransactions.accountId, [...ids]),
        inArray(recurringTransactions.toAccountId, [...ids]),
      ),
    )
    .all()) {
    note(row.accountId, "recurring");
    note(row.toAccountId, "recurring");
  }

  for (const row of db
    .select({ id: accounts.id, openingBalance: accounts.openingBalance })
    .from(accounts)
    .where(inArray(accounts.id, [...ids]))
    .all()) {
    if (!money.isZero(row.openingBalance)) note(row.id, "opening_balance");
  }

  return reasons;
}

/** Whether anything references this one account, and what. */
export function accountReference<TRun, TSchema extends typeof ledgerSchema>(
  db: Reader<TRun, TSchema>,
  id: Id<"accounts">,
): AccountReference | undefined {
  return referencedAccounts(db, [id]).get(id);
}
