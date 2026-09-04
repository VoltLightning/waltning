/**
 * The differential test — the board card's deliverable.
 *
 * Every class-F figure computed in SQL against real Postgres and in
 * `money.ts` against the same rows, asserted equal **as eight-decimal
 * strings**. Not `toBeCloseTo`: the failure this exists to catch is the one
 * where both sides look right and differ in the last place.
 *
 * Changing the rounding mode on one side alone must turn this red — the
 * fixture's `…001` row (`100.000000005`, a genuine tie at the ninth decimal)
 * is what makes that true (Task 5, step 4 of the plan this closes:
 * `ROUND_HALF_UP` flipped to `ROUND_HALF_EVEN` in `money.ts`'s Decimal clone,
 * run, reverted — see the PR description for the failing output).
 */

import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { getTableName, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accounts, transactions } from "../schema.ts";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { oldestOpenDebt } from "./counterparty-ageing.ts";
import { counterpartyBalances } from "./counterparty-balance.ts";
import { findUnsettled } from "./find-unsettled.ts";
import { ACCOUNTS, COMPANY, COUNTERPARTY, CURRENCIES, TRANSACTIONS } from "./fixture.ts";
import { netWorth } from "./net-worth.ts";
import { signedFromLeg } from "./signed.sql.ts";

const live = sql`${transactions.deletedAt} is null`;

/**
 * `accounts.id`, always qualified — not always drizzle's own choice.
 *
 * This exact shape — a correlated subquery whose own `FROM` is
 * `transactions`, which also has an `id` column, referencing the outer
 * row's `accounts.id` — renders that reference as bare `"id"` when this
 * query also selects a bare `id: accounts.id` field, which resolves inside
 * the subquery to *its own* `id`, not the outer row: `WHERE account_id = id`
 * is then never true, every sum coalesces to 0, and every account's balance
 * comes back as its opening balance alone. Confirmed by hand (`.toSQL()`)
 * against exactly this file's query shape, and confirmed absent from
 * `net-worth.ts`'s own shape (it never selects a bare `accounts.id`) and
 * from `accounts.service.ts`'s (its query joins `currencies`) — so this is
 * shape-sensitive, not a blanket drizzle rule, and qualifying explicitly
 * here removes the dependency on it entirely rather than relying on which
 * side of the line this particular query happens to sit.
 */
const accountId = sql.raw(`"${getTableName(accounts)}"."id"`);

/** §2, as SQL — the same shape `net-worth.ts`'s `balance` fragment folds. */
const sqlBalance = sql<string>`(${accounts.openingBalance}
  + coalesce((select sum(${signedFromLeg}) from ${transactions}
              where ${transactions.accountId} = ${accountId} and ${live}), 0)
  + coalesce((select sum(${transactions.toAmount}) from ${transactions}
              where ${transactions.toAccountId} = ${accountId} and ${live}), 0)
)::numeric(20,8)::text`;

/** The fixture's rows, shaped for `money.accountBalance` / `money.netWorth`. */
const legRows: money.LegRow[] = TRANSACTIONS.filter((t) => !t.deleted).map((t) => ({
  type: t.type,
  accountId: t.accountId,
  toAccountId: t.toAccountId ?? null,
  amountOriginal: money.toMoney(t.amountOriginal),
  toAmount: t.toAmount != null ? money.toMoney(t.toAmount) : null,
}));

/**
 * §7's rows, with `side` and `currency` resolved the way a caller would:
 * from `counterparty_id`, `counterparty_role`, and `coalesce(debt_currency,
 * currency)`. `side` is a rule on `type` alone — see the comment on
 * `debtDeltaOnCarryingLeg` in `counterparty-balance.ts` for why a transfer's
 * counterparty always sits on the `to` leg here, not case-by-case per row.
 */
function debtRowsFor(counterpartyId: string): money.DebtRow[] {
  return TRANSACTIONS.filter((t) => !t.deleted && t.counterpartyId === counterpartyId).map((t) => ({
    type: t.type,
    amountOriginal: money.toMoney(t.amountOriginal),
    toAmount: t.toAmount != null ? money.toMoney(t.toAmount) : null,
    side: t.type === "transfer" ? "to" : "from",
    currency: money.currencyCode(t.currency),
  }));
}
const debtRows = debtRowsFor(COUNTERPARTY.id);

/**
 * §7's rows as `money.fifoOldestOpen` wants them, for one counterparty **in
 * one currency** — ageing is per `(counterparty, currency)`, the same
 * partition `counterparty-ageing.ts` groups by. `debtDelta` is already
 * applied (the fold, not the raw amount); `id` and `date` are kept so the
 * oldest-open row can be named.
 */
function fifoDebtRowsFor(counterpartyId: string, currency: string): money.FifoDelta<string>[] {
  return TRANSACTIONS.filter(
    (t) => !t.deleted && t.counterpartyId === counterpartyId && t.currency === currency,
  ).map((t) => {
    const side: "from" | "to" = t.type === "transfer" ? "to" : "from";
    const delta = money.debtDelta(
      {
        type: t.type,
        amountOriginal: money.toMoney(t.amountOriginal),
        toAmount: t.toAmount != null ? money.toMoney(t.toAmount) : null,
      },
      side,
    );
    return { id: t.id, date: accountingDate(t.date), delta };
  });
}

/** §8's rows for one clearing account, `money.fifoOldestOpen`'s own shape. */
function clearingLegRowsFor(accountId: string): money.FifoDelta<string>[] {
  return TRANSACTIONS.filter((t) => !t.deleted)
    .filter((t) => t.accountId === accountId || t.toAccountId === accountId)
    .map((t) => ({
      id: t.id,
      date: accountingDate(t.date),
      delta: money.signed(
        {
          type: t.type,
          amountOriginal: money.toMoney(t.amountOriginal),
          toAmount: t.toAmount != null ? money.toMoney(t.toAmount) : null,
        },
        t.accountId === accountId ? "from" : "to",
      ),
    }));
}

describe("class-F figures agree to eight decimals, SQL against money.ts", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await scratchDatabase("differential");

    for (const c of CURRENCIES) {
      await scratch.sql`insert into currencies (code, name, decimals, is_pivot)
        values (${c.code}, ${c.name}, ${c.decimals}, ${c.code === "PLN"})`;
    }
    for (const a of ACCOUNTS) {
      await scratch.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
        values (${a.id}, ${a.name}, ${a.currency}, ${a.ownership}, ${a.isBusiness}, ${a.opening}, ${a.kind})`;
    }
    await scratch.sql`insert into counterparties (id, name, kind)
      values (${COUNTERPARTY.id}, ${COUNTERPARTY.name}, 'person'),
             (${COMPANY.id}, ${COMPANY.name}, 'company')`;
    for (const t of TRANSACTIONS) {
      await scratch.sql`insert into transactions
        (id, date, type, account_id, to_account_id, amount_original, to_amount,
         currency, to_currency, fx_rate, to_fx_rate, counterparty_id, counterparty_role, deleted_at)
        values (
          ${t.id}, ${t.date}, ${t.type}, ${t.accountId}, ${t.toAccountId ?? null},
          ${t.amountOriginal}, ${t.toAmount ?? null},
          ${t.currency}, ${t.toCurrency ?? null},
          ${"1"}, ${t.toAccountId ? "1" : null},
          ${t.counterpartyId ?? null}, ${t.counterpartyRole ?? null},
          ${t.deleted ? scratch.sql`now()` : null}
        )`;
    }
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it("§2 account balance, every account, including the empty one", async () => {
    const rows = await scratch.db.select({ id: accounts.id, balance: sqlBalance }).from(accounts);
    const sqlById = new Map<string, string>(rows.map((r) => [r.id, r.balance]));

    for (const account of ACCOUNTS) {
      const sqlSide = sqlById.get(account.id);
      const tsSide = money.accountBalance(money.toMoney(account.opening), account.id, legRows);
      expect(sqlSide, account.name).toBe(tsSide);
    }
  });

  it("§3 net worth, per currency", async () => {
    const sqlSide = await netWorth(scratch.db);

    const byCurrency = new Map<string, money.BalanceRow[]>();
    for (const account of ACCOUNTS) {
      const balance = money.accountBalance(money.toMoney(account.opening), account.id, legRows);
      const bucket = byCurrency.get(account.currency) ?? [];
      bucket.push({ ownership: account.ownership, balance });
      byCurrency.set(account.currency, bucket);
    }
    const tsSide = [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rows]) => ({ currency, ...money.netWorth(rows) }));

    expect(sqlSide).toEqual(tsSide);
  });

  it("§7 counterparty balance, per currency", async () => {
    // Both sides import production code now — `counterpartyBalances`
    // (SQL) and `money.counterpartyBalance` (the fold) — rather than an
    // inline CASE nothing else imports.
    const sqlRows = await counterpartyBalances(scratch.db);
    const sqlSide = sqlRows
      .filter((r) => r.counterpartyId === COUNTERPARTY.id)
      .map(({ currency, balance }) => ({ currency, balance }));

    const tsSide = money.counterpartyBalance(debtRows);

    expect(sqlSide).toEqual(tsSide);
    expect(tsSide).toEqual([
      { currency: "PLN", balance: "150.00000000" },
      { currency: "USD", balance: "30.00000000" },
    ]);
  });

  /**
   * §7's ageing — Acme (a company): 200 lent, 300 lent, 200 repaid. FIFO
   * consumes the 200 first, so the oldest **open** row is the 300 lent
   * second, not the 200 lent first. `oldestOpenDebt` (SQL) is kind-agnostic
   * by design, so this also checks Counterparty A's own PLN and USD rows —
   * the differential holds for a person too, even though only a company's
   * age reaches a screen (O15).
   */
  it("§7 ageing — the oldest open debt row, per counterparty per currency", async () => {
    const sqlRows = await oldestOpenDebt(scratch.db);
    const sqlByKey = new Map(
      sqlRows.map((r) => [
        `${r.counterpartyId}:${r.currency}`,
        { id: r.oldestUnconsumedTransactionId, date: r.oldestDate },
      ]),
    );

    for (const [counterpartyId, currency] of [
      [COMPANY.id, "PLN"],
      [COUNTERPARTY.id, "PLN"],
      [COUNTERPARTY.id, "USD"],
    ] as const) {
      const tsOldest = money.fifoOldestOpen(fifoDebtRowsFor(counterpartyId, currency));
      const sqlOldest = sqlByKey.get(`${counterpartyId}:${currency}`) ?? null;
      expect(sqlOldest, `${counterpartyId} ${currency}`).toEqual(
        tsOldest ? { id: tsOldest.id, date: tsOldest.date } : null,
      );
    }

    // The named case: Acme's still-open row is the 300 lent 2026-08-15 —
    // FIFO already consumed the 200 lent first with the 200 repaid third.
    const acme = sqlByKey.get(`${COMPANY.id}:PLN`);
    expect(acme).toEqual({ id: "20000000-0000-4000-8000-000000000012", date: "2026-08-15" });
  });

  /**
   * §8's own reading, written into `computations.md` in this PR: inflows
   * opened, outflows consume, FIFO. Two inflows to Trip clearing, one
   * allocation that exhausts the older, so the still-unconsumed inflow —
   * `find_unsettled`'s third field — is the 80 dated 2026-08-05, not the
   * 120 dated 2026-08-01.
   */
  it("§8 find_unsettled — balance and the oldest unconsumed leg", async () => {
    const tripClearing = ACCOUNTS[5];
    const sqlRows = await findUnsettled(scratch.db);
    const sqlRow = sqlRows.find((r) => r.accountId === tripClearing.id);

    const tsBalance = money.accountBalance(
      money.toMoney(tripClearing.opening),
      tripClearing.id,
      legRows,
    );
    const tsOldest = money.fifoOldestOpen(clearingLegRowsFor(tripClearing.id));

    expect(sqlRow).toEqual({
      accountId: tripClearing.id,
      balance: tsBalance,
      oldestUnconsumedTransactionId: tsOldest?.id,
      oldestDate: tsOldest?.date,
    });
    expect(sqlRow).toEqual({
      accountId: tripClearing.id,
      balance: "80.00000000",
      oldestUnconsumedTransactionId: "20000000-0000-4000-8000-000000000015",
      oldestDate: "2026-08-05",
    });
  });

  it("excludes soft-deleted rows on both sides", async () => {
    // `…009` is a 999 999.00000000 expense on Bank A, soft-deleted. If either
    // side included it, Bank A's balance would be off by that amount — not a
    // rounding-sized discrepancy, unmissable.
    const rows = await scratch.db
      .select({ id: accounts.id, balance: sqlBalance })
      .from(accounts)
      .where(sql`${accounts.id} = ${ACCOUNTS[0].id}`);
    const sqlSide = rows[0]?.balance;

    const tsSide = money.accountBalance(
      money.toMoney(ACCOUNTS[0].opening),
      ACCOUNTS[0].id,
      legRows,
    );

    expect(sqlSide).toBe(tsSide);
    expect(money.dec(tsSide ?? "0").lt(1000)).toBe(true);
  });
});
