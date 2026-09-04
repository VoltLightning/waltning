import type { AccountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { AccountKind } from "@waltning/core/registry/inputs";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, currencies, transactions } = ledgerSchema;

/**
 * Every column S16 needs: `groupId` for the grouped list, `ownership` for
 * `SharedGroup`, `archived` for the toggle, `expectedBalance` for the last
 * observation a reconciliation recorded (§5), `isBusiness` for `BalanceRow`'s
 * own `BIZ` tag (§3.3 — the marker belongs in every list a business row
 * appears in, and this is one). `openingBalance`, `openingDate`, `memo` and
 * `version` are `AccountEditor`'s own fields — the last is `update_account`'s
 * and `archive_account`'s compare-and-swap token (`architecture/14` §14.2),
 * with no field of its own on screen but no write without it either. Net
 * worth (`read-net-worth.ts`) reads the same shape — `ownership` is what its
 * fold keys on — so nothing downstream needs a second, narrower type.
 */
export type LocalAccountSummary = {
  id: Id<"accounts">;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  groupId: Id<"accountGroups"> | null;
  ownership: "own" | "shared";
  isBusiness: boolean;
  archived: boolean;
  expectedBalance: Money | null;
  openingBalance: Money;
  openingDate: AccountingDate | null;
  memo: string;
  version: number;
};

/** Kept as its own name at the net-worth call site — the concept it stands for is "what §3 needs", not "every column". */
export type LocalAccountForNetWorth = LocalAccountSummary;

export type ReadAccountsOptions = {
  /** Default `false` — S16's archived accounts sit behind their own toggle (`loadArchived()`). */
  includeArchived?: boolean;
  /** Restricts to one `kind` at the SQL level (M3) — unset reads every kind, S16's own default. */
  kind?: AccountKind;
};

/**
 * The rows both readers below fold over: every column S16 or §3 could need,
 * ordered the way the list renders. `includeArchived` is the one thing that
 * differs between them — net worth never wants an archived account's balance
 * counted twice against a total it no longer belongs to.
 */
function selectAccountRows<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  { includeArchived = false, kind }: ReadAccountsOptions,
) {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      currency: accounts.currency,
      decimals: currencies.decimals,
      groupId: accounts.groupId,
      ownership: accounts.ownership,
      isBusiness: accounts.isBusiness,
      archived: accounts.archived,
      openingBalance: accounts.openingBalance,
      openingDate: accounts.openingDate,
      memo: accounts.memo,
      version: accounts.version,
      expectedBalance: accounts.expectedBalance,
      sort: accounts.sort,
    })
    .from(accounts)
    .innerJoin(currencies, eq(accounts.currency, currencies.code))
    .where(
      and(
        includeArchived ? undefined : eq(accounts.archived, false),
        kind === undefined ? undefined : eq(accounts.kind, kind),
      ),
    )
    .orderBy(asc(accounts.sort), asc(accounts.name), asc(accounts.id))
    .all();
}

function withBalances<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  rows: readonly ReturnType<typeof selectAccountRows>[number][],
): readonly LocalAccountSummary[] {
  const ids = new Set(rows.map((account) => account.id));

  const legs =
    ids.size > 0
      ? db
          .select({
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
                inArray(transactions.accountId, [...ids]),
                inArray(transactions.toAccountId, [...ids]),
              ),
            ),
          )
          .all()
      : [];

  return rows.map(({ sort: _sort, ...account }) => ({
    ...account,
    // §2, through the one fold the phone and the differential test share.
    // `openingBalance` stays on the row too — the editor's own field,
    // distinct from the derived `balance` below.
    balance: money.accountBalance(account.openingBalance, account.id, legs),
  }));
}

/** Every active account with its ownership — what §3 needs, at the same shape `readAccounts` renders. */
export function readAccountsForNetWorth<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalAccountForNetWorth[] {
  return withBalances(db, selectAccountRows(db, { includeArchived: false }));
}

export function readAccounts<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  options: ReadAccountsOptions = {},
): readonly LocalAccountSummary[] {
  return withBalances(db, selectAccountRows(db, options));
}
