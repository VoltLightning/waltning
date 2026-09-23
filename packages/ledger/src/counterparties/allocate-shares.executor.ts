/**
 * `allocate_shares`, on the device — J08's whole write, and it had none.
 *
 * **One transaction per share, out of a funded pot.** Paying for a group is a
 * transfer *into* `Clearing · <currency>` (J08 §3); this writes each person's
 * portion back *out* of it, carrying their counterparty and
 * `counterparty_role = 'debt'`. Your own share is the same expense with the
 * allocation's category and no counterparty — not a debt, because a
 * receivable against yourself would keep the account from ever reaching zero
 * (§4).
 *
 * **Which is why the pot must be a clearing account, and this refuses any
 * other.** The write only makes sense as *spending down money already set
 * aside*: run against the account you actually paid from, it would take the
 * bill out of it twice. `kind = 'clearing'` is the structural statement that
 * an account holds money on other people's behalf (§6.4), and it is the one
 * thing that makes this operation's arithmetic mean what it says.
 *
 * **It refuses an allocation larger than the pot holds.** §4 allows a split
 * that does not sum — the remainder stays, and the banner with it — but
 * giving away more than is there drives the pot *past* zero, where a
 * non-zero balance stops meaning "shares are missing" and starts meaning the
 * opposite. Read from the live replica, the same way `settle_debt` reads the
 * live balance rather than trusting a figure the screen was holding.
 *
 * **Every row is one transaction, so a split is one audited event.** Four
 * rows that might half-exist is exactly the state §6.4's invariant cannot
 * survive: a pot at 100,00 that should be at 0,00 and nothing on screen to
 * say which share never landed.
 *
 * `insertTransaction` (`transactions/create-transaction.executor.ts`) is the
 * one write path for the table — this mints its rows through it rather than a
 * second `tx.insert(transactions)`, the same reason `settle_debt` and
 * `reconcile_account` do.
 */

import type { AccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import {
  type AllocateSharesInput,
  allocateSharesInput,
  createTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import {
  insertTransaction,
  type LocalTransactionRow,
} from "../transactions/create-transaction.executor.ts";

const { accounts, counterparties, transactions } = schema;

export type AllocateSharesResult = {
  /** One row per share, in the order they were given. */
  rows: readonly LocalTransactionRow[];
  /** What the pot still holds — `0` when the split was complete (§6.4). */
  remaining: money.Money;
};

export const allocateSharesExecutor = defineLocalExecutor<
  typeof allocateSharesInput,
  AllocateSharesResult,
  ReplicaTx
>({
  operation: "allocate_shares",
  opVersion: 1,
  input: allocateSharesInput,
  /** Every row this brings into existence — `executor.ts` on why it is required. */
  mints: (input) => input.shares.map((share) => share.id),
  // Read-only, pre-outbox: a figure past its currency's scale is refused
  // before the entry commits rather than queued as an intent nothing will
  // ever apply — `settle_debt`'s own R4 ruling, applied per share.
  validate: (input, tx) => {
    for (const share of input.shares) {
      assertMoneyScale(tx, share.amount, input.currency, "allocate_shares: amount_original");
    }
  },
  apply: (input, tx) => allocateShares(input, tx),
});

function allocateShares(input: AllocateSharesInput, tx: ReplicaTx): AllocateSharesResult {
  const [account] = tx
    .select({ currency: accounts.currency, kind: accounts.kind, opening: accounts.openingBalance })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .all();
  if (!account) {
    throw new LocalRefusal(`allocate_shares: no account ${input.accountId}`, { dependency: true });
  }

  // §6.4 — the pot is an account that holds money on other people's behalf.
  // Allocating out of the account you paid *from* would subtract the bill a
  // second time, and nothing downstream would say so: the balances would
  // simply be wrong.
  if (account.kind !== "clearing") {
    throw new LocalRefusal(
      `allocate_shares: account ${input.accountId} is a ${account.kind} account — ` +
        "shares are allocated out of a clearing account, which is the one that holds " +
        "money on other people's behalf",
    );
  }

  // §6.5 — a transaction's currency is its account's currency. Postgres has a
  // trigger; the phone has none, so this is checked here rather than written
  // and refused at drain (`settle_debt`'s own R2 H3).
  if (account.currency !== input.currency) {
    throw new LocalRefusal(
      `allocate_shares: currency ${input.currency} does not match account currency ` +
        `${account.currency} (account ${input.accountId})`,
    );
  }

  // Read once, and kept: the name is what the row is *called* in the ledger
  // (`settle_debt` stamps the same field for the same reason). Without it an
  // allocation lands as three rows reading `—`, and the one screen that says
  // who a share belongs to is the debt ledger — not the list you scroll.
  const names = new Map<string, string>();
  for (const share of input.shares) {
    if (share.counterpartyId === null) continue;
    const [counterparty] = tx
      .select({ name: counterparties.name })
      .from(counterparties)
      .where(eq(counterparties.id, share.counterpartyId))
      .all();
    if (!counterparty) {
      throw new LocalRefusal(`allocate_shares: no counterparty ${share.counterpartyId}`, {
        dependency: true,
      });
    }
    names.set(share.counterpartyId, counterparty.name);
  }

  const pot = potBalance(input.accountId, account.opening, input.date, tx);
  const total = input.shares.reduce(
    (sum, share) => money.add(sum, share.amount),
    money.ZERO as money.Money,
  );
  // §4 allows a split that does not sum — the remainder stays on the pot and
  // the banner stays with it. What it does not allow is handing out more than
  // is there, which puts the balance past zero, where the sign no longer
  // means "shares are missing".
  if (money.cmp(total, pot) > 0) {
    throw new LocalRefusal(
      `allocate_shares: ${total} ${input.currency} allocated out of a pot holding ` +
        `${pot} ${input.currency} — a share cannot come from money the account does not hold`,
    );
  }

  const rows = input.shares.map((share) =>
    insertTransaction(
      createTransactionInput.parse({
        id: share.id,
        date: input.date,
        type: "expense",
        accountId: input.accountId,
        amountOriginal: share.amount,
        currency: input.currency,
        categoryId: input.categoryId,
        note: input.note,
        source: "manual",
        // §6.6 — set at write time, never inferred. A share with nobody on it
        // is yours: an ordinary expense, and deliberately not a debt.
        ...(share.counterpartyId === null
          ? {}
          : {
              counterpartyId: share.counterpartyId,
              counterpartyRole: "debt" as const,
              payee: names.get(share.counterpartyId) ?? "",
            }),
      }),
      tx,
    ),
  );

  return { rows, remaining: potBalance(input.accountId, account.opening, input.date, tx) };
}

/**
 * §2's fold for one account, as of the allocation's own date — `money
 * .accountBalance` over the legs that touch it.
 *
 * **As of `date`, not as of now**, for the reason `reconcile_account` gives
 * for the same cutoff: a transfer that funds the pot next week is not money
 * this allocation may hand out today.
 */
function potBalance(
  accountId: AllocateSharesInput["accountId"],
  openingBalance: money.Money,
  date: AccountingDate,
  tx: ReplicaTx,
): money.Money {
  const rows = tx
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
        lte(transactions.date, date),
        or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)),
      ),
    )
    .all();
  return money.accountBalance(openingBalance, accountId, rows);
}
