/**
 * Accounts, and the balance that goes on them.
 *
 * **`computations.md` §2, in SQL, once.** The figure is class F, which means the
 * phone folds the same definition from a checkpoint — so a second
 * implementation here in TypeScript would be a permanent drift surface in the
 * one place drift is invisible: both sides would be wrong identically, agree
 * with each other, and reconcile without a discrepancy.
 *
 * It is the SQL counterpart of `money.signed()` in `packages/core`, which the
 * phone folds — the two-implementation split §0 accepts for class F, and the
 * one place they must not disagree. `signed()` was correct all along; only the
 * specification's formula was wrong.
 *
 * The formula this implements is the **corrected** §2 (C30). The specification
 * negated every source-leg row, income included, which put the wrong sign on
 * every salary in the ledger — against §1 one paragraph above it. On this
 * fixture that is the difference between +37 931,70 and −47 268,30.
 */

import type * as money from "@waltning/core/money";
import type { DbHandle } from "@waltning/db/client";
import { signedFromLeg } from "@waltning/db/figures/signed.sql";
import { accounts, currencies, transactions } from "@waltning/db/schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

export type AccountSummary = {
  id: string;
  name: string;
  kind: string;
  /** The account's own currency. The balance is denominated in it, always. */
  currency: string;
  /** `numeric(20,8)` as a decimal string. A JS number holding this is a bug. */
  /**
   * `Money`, not `string`. The brand is what stops this being interchangeable
   * with the `name` two fields up — and it survives all the way to the phone,
   * because the client's `Account` type is inferred from this declaration.
   */
  balance: money.Money;
  /**
   * The currency's decimal places, carried with the balance rather than assumed
   * to be 2. A screen that hardcodes two is correct for every currency in this
   * fixture and wrong for JPY, and the error looks like a formatting quirk.
   */
  decimals: number;
  archived: boolean;
};

/**
 * `T` — live transactions. Soft-deleted rows do not count toward a balance,
 * which the specification left to the reader until C30 defined it.
 */
const live = sql`${transactions.deletedAt} is null`;

/**
 * The source leg, signed by **type** — `signedFromLeg` (§1), summed.
 *
 * `expense` and the source leg of a `transfer` leave the account; `income` and
 * `adjustment` add to it, and an `adjustment` carries its own sign so negating
 * it would invert the correction it exists to make (§1).
 */
const sourceLeg = sql<string>`
  coalesce((
    SELECT sum(${signedFromLeg})
    FROM ${transactions}
    WHERE ${transactions.accountId} = ${accounts.id} AND ${live}
  ), 0)`;

/**
 * The destination leg of a transfer, which arrives as `to_amount` — a different
 * figure from `amount_original`, in a possibly different currency (§7.2).
 * Summing `amount_original` here is the mistake §1 warns about.
 */
const destinationLeg = sql<string>`
  coalesce((
    SELECT sum(${transactions.toAmount})
    FROM ${transactions}
    WHERE ${transactions.toAccountId} = ${accounts.id} AND ${live}
  ), 0)`;

export async function listAccounts(
  db: DbHandle,
  includeArchived: boolean,
): Promise<AccountSummary[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      currency: accounts.currency,
      archived: accounts.archived,
      decimals: currencies.decimals,
      balance: sql<money.Money>`(${accounts.openingBalance} + ${sourceLeg} + ${destinationLeg})`,
    })
    .from(accounts)
    .innerJoin(currencies, eq(currencies.code, accounts.currency))
    .where(includeArchived ? undefined : eq(accounts.archived, false))
    .orderBy(asc(accounts.sort), asc(accounts.name));

  return rows;
}

/** Total across accounts sharing one currency. Never a cross-currency sum. */
export async function countAccounts(db: DbHandle): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(and(eq(accounts.archived, false), isNull(accounts.groupId)));
  return row?.n ?? 0;
}
