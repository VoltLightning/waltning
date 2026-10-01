/**
 * `record_opening_debt` (§6.6) — a debt that predates the ledger, entered on a
 * person's page. The owner's decision: it sets the person's balance the way an
 * account's opening balance does, it is **never income or spending**, and
 * `settle_debt` settles against it like any other debt.
 *
 * Real two-file writes through `writeLocally` and the real `ledgerRegistry`,
 * the same harness as `counterparty-ops.test.ts`. Every shape guarantee is
 * broken once, directly against the table, to prove the constraint fires
 * when the executor's own checks are not in the way.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { readBalanceAsOf } from "../accounts/read-balance-as-of.ts";
import { readNetWorth } from "../accounts/read-net-worth.ts";
import { deleteOpeningDebtExecutor } from "../counterparties/delete-opening-debt.executor.ts";
import { mergeCounterpartiesExecutor } from "../counterparties/merge-counterparties.executor.ts";
import { readCounterpartyBalances } from "../counterparties/read-counterparty-balances.ts";
import { readOpeningDebts } from "../counterparties/read-opening-debts.ts";
import { recordOpeningDebtExecutor } from "../counterparties/record-opening-debt.executor.ts";
import { settleDebtExecutor } from "../counterparties/settle-debt.executor.ts";
import { unmergeCounterpartiesExecutor } from "../counterparties/unmerge-counterparties.executor.ts";
import { updateCurrencyExecutor } from "../currencies/update-currency.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { readContextRows } from "../transactions/read-context-rows.ts";
import { readDayFlows } from "../transactions/read-day-flows.ts";
import { readIncomeVsExpense } from "../transactions/read-income-vs-expense.ts";
import { readPeriodSpend } from "../transactions/read-period-spend.ts";
import { readSpendByCategory } from "../transactions/read-spend-by-category.ts";
import { supersedeTransactionExecutor } from "../transactions/supersede-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { counterparties, openingDebts, outbox, transactions } = schema;

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const NINA = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const MAREK = id<"counterparties">("33333333-3333-4333-8333-333333333333");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };
const TODAY = accountingDate("2026-09-15");
const AUGUST = { start: accountingDate("2026-08-01"), end: accountingDate("2026-09-01") };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values([
      { code: PLN, name: "Placeholder", decimals: 2, isPivot: true },
      { code: EUR, name: "Placeholder", decimals: 2 },
    ])
    .run();
  db.insert(schema.accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN }).run();
  db.insert(counterparties)
    .values([
      { id: NINA, name: "Nina", nameFolded: "nina" },
      { id: MAREK, name: "Marek", nameFolded: "marek" },
    ])
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

let n = 0;
const nextId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, "0")}`;

function recordOpening(over: Record<string, unknown> = {}) {
  return write(recordOpeningDebtExecutor, {
    id: nextId(),
    counterpartyId: NINA,
    direction: "theyOwe",
    amount: "200",
    currency: "PLN",
    date: "2026-01-01",
    today: "2026-09-15",
    ...over,
  });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();

const balanceOf = (counterpartyId: string, currency: string) =>
  readCounterpartyBalances(s.ledger.replica.db, TODAY).find(
    (row) => row.counterpartyId === counterpartyId && row.currency === currency,
  )?.balance;

describe("record_opening_debt — the balance", () => {
  it("sets the person's balance: they owe you 200, and a repayment of 50 leaves 150", () => {
    recordOpening();
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("200"));

    const settled = write(settleDebtExecutor, {
      id: nextId(),
      counterpartyId: NINA,
      accountId: ACCOUNT,
      date: "2026-09-01",
      amount: "50",
      currency: "PLN",
      type: "income",
      discharges: { currency: "PLN", amount: "50" },
    });

    expect(settled.row.residual).toBe(money.toMoney("150"));
    expect(settled.row.overSettled).toBe(false);
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("150"));
  });

  it("points the other way when you owe them", () => {
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "80.50" });
    expect(balanceOf(MAREK, "PLN")).toBe(money.toMoney("-80.5"));

    const settled = write(settleDebtExecutor, {
      id: nextId(),
      counterpartyId: MAREK,
      accountId: ACCOUNT,
      date: "2026-09-01",
      amount: "30.50",
      currency: "PLN",
      type: "expense",
      discharges: { currency: "PLN", amount: "30.50" },
    });
    expect(settled.row.residual).toBe(money.toMoney("-50"));
  });

  it("holds one balance per currency, side by side", () => {
    recordOpening();
    recordOpening({ direction: "youOwe", amount: "10", currency: "EUR" });
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("200"));
    expect(balanceOf(NINA, "EUR")).toBe(money.toMoney("-10"));
  });

  it("adds to the debt-role transactions already on the person", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">(nextId()),
        date: accountingDate("2026-08-01"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("25"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
        obligationCounterpartyId: NINA,
        obligationRole: "debt",
      })
      .run();
    recordOpening();
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("225"));
  });

  it("replaces the row for that person and currency rather than stacking a second", () => {
    const first = recordOpening();
    const second = recordOpening({ amount: "300", direction: "youOwe", date: "2026-02-02" });

    const rows = readOpeningDebts(s.ledger.replica.db, NINA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id, "the row keeps the id it was first written with").toBe(first.row.row.id);
    expect(second.row.row.id).toBe(first.row.row.id);
    expect(rows[0]?.direction).toBe("youOwe");
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("-300"));
  });

  it("replays idempotently — twice is once", () => {
    const input = {
      id: nextId(),
      counterpartyId: NINA,
      direction: "theyOwe",
      amount: "200",
      currency: "PLN",
      date: "2026-01-01",
      today: "2026-09-15",
    };
    write(recordOpeningDebtExecutor, input);
    expect(() => write(recordOpeningDebtExecutor, input)).not.toThrow();
    expect(readOpeningDebts(s.ledger.replica.db, NINA)).toHaveLength(1);
  });
});

describe("record_opening_debt — never income or spending", () => {
  it("leaves every period figure, every account and the transaction table as they were", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">(nextId()),
        date: accountingDate("2026-08-10"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();
    const before = {
      spend: readPeriodSpend(s.ledger.replica.db, AUGUST),
      netWorth: readNetWorth(s.ledger.replica.db),
      transactions: s.ledger.replica.db.select().from(transactions).all().length,
    };

    recordOpening({ date: "2026-08-15", amount: "999999999.99" });
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", date: "2026-08-20" });

    expect(readPeriodSpend(s.ledger.replica.db, AUGUST)).toEqual(before.spend);
    expect(readNetWorth(s.ledger.replica.db)).toEqual(before.netWorth);
    expect(s.ledger.replica.db.select().from(transactions).all()).toHaveLength(before.transactions);
  });

  it("has nowhere to put a category or an account: the row carries neither", () => {
    expect(Object.keys(getTableColumns(openingDebts)).sort()).toEqual([
      "amount",
      "counterpartyId",
      "createdAt",
      "currency",
      "date",
      "deletedAt",
      "direction",
      "id",
      "updatedAt",
    ]);
  });
});

describe("record_opening_debt — refusals", () => {
  it("refuses a person the replica does not hold, as a dependency", () => {
    expect(() => recordOpening({ counterpartyId: "99999999-9999-4999-8999-999999999999" })).toThrow(
      /no counterparty/,
    );
  });

  it("refuses a figure past its currency's scale", () => {
    expect(() => recordOpening({ amount: "10.005" })).toThrow(/more decimal places/);
    expect(readOpeningDebts(s.ledger.replica.db, NINA)).toHaveLength(0);
  });

  it("refuses an amount at the ceiling, zero and a negative", () => {
    expect(() => recordOpening({ amount: "1000000000" })).toThrow(/999999999.99/);
    expect(() => recordOpening({ amount: "0" })).toThrow(/positive/);
    expect(() => recordOpening({ amount: "-5" })).toThrow(/positive/);
  });

  it("takes the largest amount the ceiling allows", () => {
    expect(() => recordOpening({ amount: "999999999.99" })).not.toThrow();
  });

  it("refuses an unknown direction and an unreal date", () => {
    expect(() => recordOpening({ direction: "both" })).toThrow();
    expect(() => recordOpening({ date: "2026-13-40" })).toThrow();
  });
});

/**
 * Each constraint broken once, straight at the table: the executor's own
 * checks are not the guarantee, these are. The in-bounds twin proves the row
 * is otherwise valid, so a constraint that refuses everything does not pass.
 */
describe("opening_debts — the table's own constraints", () => {
  const insert = (over: Partial<typeof openingDebts.$inferInsert> = {}) =>
    s.ledger.replica.db
      .insert(openingDebts)
      .values({
        id: id<"openingDebts">(nextId()),
        counterpartyId: NINA,
        currency: PLN,
        direction: "theyOwe",
        amount: money.toMoney("10"),
        date: accountingDate("2026-01-01"),
        ...over,
      })
      .run();

  it("takes a valid row", () => {
    expect(() => insert()).not.toThrow();
  });

  it("refuses an amount that is not above zero (opening_debts_amount_positive)", () => {
    expect(() => insert({ amount: money.toMoney("0") })).toThrow(/opening_debts_amount_positive/);
    expect(() => insert({ amount: money.toMoney("-1") })).toThrow(/opening_debts_amount_positive/);
  });

  it("refuses an amount at the ceiling (opening_debts_amount_ceiling)", () => {
    expect(() => insert({ amount: money.toMoney("999999999.99") })).not.toThrow();
    expect(() => insert({ counterpartyId: MAREK, amount: money.toMoney("1000000000") })).toThrow(
      /opening_debts_amount_ceiling/,
    );
  });

  it("refuses a direction that is neither of the two (opening_debts_direction_known)", () => {
    expect(() =>
      s.ledger.replica.db
        .insert(openingDebts)
        .values({
          id: id<"openingDebts">(nextId()),
          counterpartyId: NINA,
          currency: PLN,
          // The column is typed to the two words; the table must still hold when it is not.
          direction: "neither" as "theyOwe",
          amount: money.toMoney("10"),
          date: accountingDate("2026-01-01"),
        })
        .run(),
    ).toThrow(/opening_debts_direction_known/);
  });

  it("refuses a second row for one person and currency (opening_debts_counterparty_currency_uq)", () => {
    insert();
    expect(() => insert()).toThrow(/UNIQUE/);
    expect(() => insert({ currency: EUR })).not.toThrow();
  });

  it("is read back through the person it names", () => {
    insert();
    const [row] = s.ledger.replica.db
      .select()
      .from(openingDebts)
      .where(eq(openingDebts.counterpartyId, NINA))
      .all();
    expect(row?.amount).toBe(money.toMoney("10"));
  });
});

/* ── what a repayment, a re-record, a delete and a merge do to it ─────────── */

const SEPTEMBER = { start: accountingDate("2026-09-01"), end: accountingDate("2026-10-01") };

function settle(over: Record<string, unknown> = {}) {
  return write(settleDebtExecutor, {
    id: nextId(),
    counterpartyId: NINA,
    accountId: ACCOUNT,
    date: "2026-09-02",
    amount: "50",
    currency: "PLN",
    type: "income",
    discharges: { currency: "PLN", amount: "50" },
    ...over,
  });
}

const accountBalance = () =>
  readBalanceAsOf(s.ledger.replica.db, ACCOUNT, accountingDate("2026-12-31"));
const liveTransactions = () =>
  s.ledger.replica.db
    .select()
    .from(transactions)
    .all()
    .filter((row) => row.deletedAt === null);

describe("record_opening_debt — refusals past the shape", () => {
  it("refuses an archived person", () => {
    s.ledger.replica.db
      .update(counterparties)
      .set({ archived: true })
      .where(eq(counterparties.id, NINA))
      .run();
    expect(() => recordOpening()).toThrow(/is archived/);
  });

  it("refuses a date later than the device's own day, and takes today", () => {
    expect(() => recordOpening({ date: "2026-09-16" })).toThrow(/today or earlier/);
    expect(() => recordOpening({ date: "2026-09-15" })).not.toThrow();
  });

  it("holds 999999999.99999999 at the table: the ceiling is a digit count, not a rounded real", () => {
    expect(() =>
      s.ledger.replica.db
        .insert(openingDebts)
        .values({
          id: id<"openingDebts">(nextId()),
          counterpartyId: NINA,
          currency: PLN,
          direction: "theyOwe",
          amount: money.toMoney("999999999.99999999"),
          date: accountingDate("2026-01-01"),
        })
        .run(),
    ).not.toThrow();
  });
});

describe("record_opening_debt — a re-record reports what it did to the balance", () => {
  it("returns the resulting balance, what was repaid, and no flip while the sign holds", () => {
    recordOpening();
    settle();
    const again = recordOpening({ amount: "300" });
    expect(again.row.balance).toBe(money.toMoney("250"));
    expect(again.row.repaid).toBe(money.toMoney("50"));
    expect(again.row.flipped).toBe(false);
  });

  it("flags a flip when more was repaid than the new figure — and the repayments stay", () => {
    recordOpening();
    settle({ amount: "150", discharges: { currency: "PLN", amount: "150" } });
    const again = recordOpening({ amount: "100" });
    expect(again.row.balance).toBe(money.toMoney("-50"));
    expect(again.row.flipped).toBe(true);
    expect(readOpeningDebts(s.ledger.replica.db, NINA)[0]?.repayments).toHaveLength(1);
  });
});

describe("a repayment of an existing debt", () => {
  it("is stamped with the debt it drew on, and moves the account but no period figure", () => {
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "80" });
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">(nextId()),
        date: accountingDate("2026-09-01"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();
    const db = s.ledger.replica.db;
    const before = {
      spend: readPeriodSpend(db, SEPTEMBER),
      flows: readDayFlows(db, SEPTEMBER),
      byCategory: readSpendByCategory(db, SEPTEMBER, "mine"),
      incomeVsExpense: readIncomeVsExpense(db, [{ ...SEPTEMBER, label: "Sep" }], "mine"),
      account: accountBalance(),
    };
    // The vacuity guard: the figures above are not empty, so equal means something.
    expect(before.spend.length).toBeGreaterThan(0);

    const repaid = settle({
      counterpartyId: MAREK,
      type: "expense",
      amount: "30",
      discharges: { currency: "PLN", amount: "30" },
    });

    const debt = readOpeningDebts(s.ledger.replica.db, MAREK)[0];
    expect(repaid.row.row.settlesOpeningDebtId).toBe(debt?.id);
    // The account moved by the repayment …
    expect(accountBalance()).toBe(money.sub(before.account, money.toMoney("30")));
    // … and no period figure saw it: spend, the day flows, spend by category and income vs expense.
    expect(readPeriodSpend(db, SEPTEMBER)).toEqual(before.spend);
    expect(readDayFlows(db, SEPTEMBER)).toEqual(before.flows);
    expect(readSpendByCategory(db, SEPTEMBER, "mine")).toEqual(before.byCategory);
    expect(readIncomeVsExpense(db, [{ ...SEPTEMBER, label: "Sep" }], "mine")).toEqual(
      before.incomeVsExpense,
    );
  });

  it("is left out of the display-currency rebased paths too: its date is never even asked a rate", () => {
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "80" });
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">(nextId()),
        date: accountingDate("2026-09-01"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();
    settle({
      counterpartyId: MAREK,
      type: "expense",
      date: "2026-09-20",
      amount: "30",
      discharges: { currency: "PLN", amount: "30" },
    });

    const asked: string[] = [];
    const rebase = {
      currency: EUR,
      perPivot: (date: string) => {
        asked.push(date);
        return { rate: money.unitsPerPivot("0.25"), estimated: false };
      },
    };
    const db = s.ledger.replica.db;
    readSpendByCategory(db, SEPTEMBER, "mine", { rebase });
    readIncomeVsExpense(db, [{ ...SEPTEMBER, label: "Sep" }], "mine", { rebase });

    expect(asked).toContain("2026-09-01");
    expect(asked).not.toContain("2026-09-20");
  });

  it("an ordinary settlement of a person with no existing debt is not stamped", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">(nextId()),
        date: accountingDate("2026-08-01"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("100"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
        obligationCounterpartyId: NINA,
        obligationRole: "debt",
      })
      .run();
    expect(settle().row.row.settlesOpeningDebtId).toBeNull();
  });

  it("is refused at the table unless it is a debt-role row (transactions_opening_link_shape)", () => {
    recordOpening();
    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    expect(() =>
      s.ledger.replica.db
        .insert(transactions)
        .values({
          id: id<"transactions">(nextId()),
          date: accountingDate("2026-09-01"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("5"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
          settlesOpeningDebtId: debt?.id ?? null,
        })
        .run(),
    ).toThrow(/transactions_opening_link_shape/);
  });
});

describe("delete_opening_debt — the whole chain, in one write", () => {
  it("soft-deletes the debt and its repayments, restoring the balance and the accounts", () => {
    const accountAtStart = accountBalance();
    recordOpening();
    settle();
    settle({ amount: "100", discharges: { currency: "PLN", amount: "100" } });
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("50"));
    expect(accountBalance()).toBe(money.add(accountAtStart, money.toMoney("150")));

    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    expect(debt?.repayments).toHaveLength(2);
    expect(debt?.repaid).toBe(money.toMoney("150"));

    const deleted = write(deleteOpeningDebtExecutor, { id: debt?.id });

    expect(deleted.row.deletedRepayments).toBe(2);
    expect(deleted.row.repaid).toBe(money.toMoney("150"));
    expect(balanceOf(NINA, "PLN")).toBeUndefined();
    expect(readOpeningDebts(s.ledger.replica.db, NINA)).toHaveLength(0);
    expect(liveTransactions()).toHaveLength(0);
    // The accounts those repayments moved change back.
    expect(accountBalance()).toBe(accountAtStart);
    // One outbox entry for the delete, on top of the three writes before it.
    expect(entries()).toHaveLength(4);
  });

  it("is atomic: a refusal inside it leaves the debt and every repayment in place", () => {
    recordOpening();
    settle();
    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    // A poisoned repayment: the write cannot soft-delete it, so the whole write must roll back.
    s.ledger.replica.db.run(
      sql.raw(
        "create trigger poison before update of deleted_at on transactions begin select raise(abort, 'poisoned'); end",
      ),
    );
    expect(() => write(deleteOpeningDebtExecutor, { id: debt?.id })).toThrow(/poisoned/);
    s.ledger.replica.db.run(sql.raw("drop trigger poison"));

    expect(readOpeningDebts(s.ledger.replica.db, NINA)).toHaveLength(1);
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("150"));
    expect(liveTransactions()).toHaveLength(1);
  });

  it("refuses a debt that is already gone, and frees the currency for a new one", () => {
    recordOpening();
    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    write(deleteOpeningDebtExecutor, { id: debt?.id });
    expect(() => write(deleteOpeningDebtExecutor, { id: debt?.id })).toThrow(/already deleted/);
    expect(() => recordOpening({ amount: "75" })).not.toThrow();
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("75"));
  });
});

describe("merge_counterparties — opening debts", () => {
  const mergeId = () => id<"counterpartyMerges">(nextId());
  const merge = (movedTransactionIds: string[] = []) =>
    write(mergeCounterpartiesExecutor, {
      mergeId: mergeId(),
      winnerId: NINA,
      loserId: MAREK,
      movedTransactionIds,
    });
  const unmerge = (mergeRowId: string) =>
    write(unmergeCounterpartiesExecutor, { mergeId: mergeRowId });

  it("moves a debt the winner has no counterpart for, and unmerge gives it back", () => {
    recordOpening({ counterpartyId: MAREK, currency: "EUR", amount: "10", direction: "youOwe" });
    const merged = merge();
    expect(balanceOf(NINA, "EUR")).toBe(money.toMoney("-10"));
    expect(balanceOf(MAREK, "EUR")).toBeUndefined();

    unmerge(merged.row.merge.id);
    expect(balanceOf(MAREK, "EUR")).toBe(money.toMoney("-10"));
    expect(balanceOf(NINA, "EUR")).toBeUndefined();
  });

  it("sums same-currency debts into the winner's row by sign, and unmerge restores both", () => {
    recordOpening({ amount: "200" });
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "50", date: "2025-05-05" });
    const merged = merge();

    const [row] = readOpeningDebts(s.ledger.replica.db, NINA);
    expect(row?.direction).toBe("theyOwe");
    expect(row?.amount).toBe(money.toMoney("150"));
    expect(row?.date).toBe("2025-05-05");
    expect(readOpeningDebts(s.ledger.replica.db, MAREK)).toHaveLength(0);

    unmerge(merged.row.merge.id);
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("200"));
    expect(balanceOf(MAREK, "PLN")).toBe(money.toMoney("-50"));
  });

  it("drops both rows when they cancel, repayments stay on the winner, and unmerge restores", () => {
    recordOpening({ amount: "50" });
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "50" });
    const merged = merge();
    expect(readOpeningDebts(s.ledger.replica.db, NINA)).toHaveLength(0);
    expect(balanceOf(NINA, "PLN")).toBeUndefined();

    unmerge(merged.row.merge.id);
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("50"));
    expect(balanceOf(MAREK, "PLN")).toBe(money.toMoney("-50"));
  });

  it("points the loser's repayments at the winner's row, so deleting it takes them along", () => {
    recordOpening({ amount: "200" });
    recordOpening({ counterpartyId: MAREK, amount: "100" });
    const repayment = settle({
      counterpartyId: MAREK,
      amount: "30",
      discharges: { currency: "PLN", amount: "30" },
    });
    merge([repayment.row.row.id]);

    const [row] = readOpeningDebts(s.ledger.replica.db, NINA);
    expect(row?.amount).toBe(money.toMoney("300"));
    expect(row?.repayments).toHaveLength(1);
    write(deleteOpeningDebtExecutor, { id: row?.id });
    expect(liveTransactions()).toHaveLength(0);
  });
});

describe("update_currency — an opening debt names its currency", () => {
  it("refuses lowering a currency's decimals under a live debt of 10.55 (phone and Postgres agree)", () => {
    recordOpening({ currency: "EUR", amount: "10.55" });
    expect(() =>
      write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 0 } }),
    ).toThrow(/decimals cannot shrink/);
  });

  it("refuses it under a deleted one too, for the restore's sake — but a live-free currency is not blocked by it", () => {
    recordOpening({ currency: "EUR", amount: "10.55" });
    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    write(deleteOpeningDebtExecutor, { id: debt?.id });
    // No live reference now; the stored figure past the narrower scale still refuses.
    expect(() =>
      write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 0 } }),
    ).toThrow(/already stored/);
  });
});

/* ── what a repayment is linked to: only what is open, only the right way ─── */

function debtRow(over: Record<string, unknown>) {
  const rowId = nextId();
  s.ledger.replica.db
    .insert(transactions)
    .values({
      id: id<"transactions">(rowId),
      date: accountingDate("2026-08-01"),
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: money.toMoney("100"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      obligationCounterpartyId: NINA,
      obligationRole: "debt",
      ...over,
    })
    .run();
  return rowId;
}

const linkOf = (txnId: string) =>
  s.ledger.replica.db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id<"transactions">(txnId)))
    .all()[0]?.settlesOpeningDebtId ?? null;

describe("a repayment is linked only to what is still open on the existing debt", () => {
  it("does not link a repayment of an ordinary debt once the existing one is fully repaid", () => {
    recordOpening();
    const first = settle({ amount: "200", discharges: { currency: "PLN", amount: "200" } });
    expect(linkOf(first.row.row.id)).not.toBeNull();

    // A real lend of 100, repaid in full: that repayment is an ordinary one.
    debtRow({ amountOriginal: money.toMoney("100") });
    const second = settle({ amount: "100", discharges: { currency: "PLN", amount: "100" } });
    expect(linkOf(second.row.row.id)).toBeNull();

    // Deleting the existing debt takes only its own chain; the real 100 stays.
    const debt = readOpeningDebts(s.ledger.replica.db, NINA)[0];
    expect(debt?.repayments).toHaveLength(1);
    write(deleteOpeningDebtExecutor, { id: debt?.id });
    const left = liveTransactions().map((row) => row.id);
    expect(left).toContain(second.row.row.id);
    expect(left).not.toContain(first.row.row.id);
  });

  it("splits a settlement that crosses the end of the existing debt: the linked part and the rest", () => {
    recordOpening();
    debtRow({ amountOriginal: money.toMoney("100") });
    const accountAtStart = accountBalance();
    const spillId = nextId();

    const crossed = settle({
      amount: "250",
      discharges: { currency: "PLN", amount: "250" },
      spillId,
    });

    const linked = crossed.row.row;
    const spill = crossed.row.spill;
    expect(spill?.id).toBe(spillId);
    expect(linked.amountOriginal).toBe(money.toMoney("200"));
    expect(linked.debtAmount).toBe(money.toMoney("200"));
    expect(linkOf(linked.id)).not.toBeNull();
    expect(spill?.amountOriginal).toBe(money.toMoney("50"));
    expect(spill?.debtAmount).toBe(money.toMoney("50"));
    expect(spill?.settlesOpeningDebtId).toBeNull();
    // The account moved by exactly what was paid, and the debt is 300 - 250 = 50 left.
    expect(accountBalance()).toBe(money.add(accountAtStart, money.toMoney("250")));
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("50"));

    // Deleting the existing debt takes the linked part and leaves the ordinary one.
    write(deleteOpeningDebtExecutor, { id: readOpeningDebts(s.ledger.replica.db, NINA)[0]?.id });
    expect(liveTransactions().map((row) => row.id)).toContain(spillId);
    expect(liveTransactions().map((row) => row.id)).not.toContain(linked.id);
  });

  it("splits in proportion where a part was forgiven, and the two add back to what was paid", () => {
    recordOpening({ amount: "90" });
    debtRow({ amountOriginal: money.toMoney("60") });

    // 100.00 paid discharging 150.00 of the debt: 90 of it pays the existing debt.
    const crossed = settle({
      amount: "100",
      discharges: { currency: "PLN", amount: "150" },
      spillId: nextId(),
    });

    const spill = crossed.row.spill;
    expect(crossed.row.row.amountOriginal).toBe(money.toMoney("60"));
    expect(crossed.row.row.debtAmount).toBe(money.toMoney("90"));
    expect(spill?.amountOriginal).toBe(money.toMoney("40"));
    expect(spill?.debtAmount).toBe(money.toMoney("60"));
  });

  it("does not link a repayment that points the other way", () => {
    recordOpening();
    // They owe 200, then you borrow 500: net you owe 300. Paying 300 is paying that loan.
    debtRow({ type: "income", amountOriginal: money.toMoney("500") });
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("-300"));

    const paid = settle({
      type: "expense",
      amount: "300",
      discharges: { currency: "PLN", amount: "300" },
    });
    expect(linkOf(paid.row.row.id)).toBeNull();
    expect(readOpeningDebts(s.ledger.replica.db, NINA)[0]?.repayments).toHaveLength(0);
  });
});

describe("a linked repayment's link follows its person and role", () => {
  it("clears the link when the person changes to one with no existing debt", () => {
    recordOpening();
    const paid = settle({ amount: "50", discharges: { currency: "PLN", amount: "50" } });
    expect(linkOf(paid.row.row.id)).not.toBeNull();

    write(updateTransactionExecutor, {
      id: paid.row.row.id,
      version: paid.row.row.version,
      patch: { obligationCounterpartyId: MAREK },
    });
    expect(linkOf(paid.row.row.id)).toBeNull();
  });

  it("re-derives the link where the new person has an existing debt the repayment fits in", () => {
    recordOpening();
    recordOpening({ counterpartyId: MAREK, amount: "80" });
    const paid = settle({ amount: "50", discharges: { currency: "PLN", amount: "50" } });

    write(updateTransactionExecutor, {
      id: paid.row.row.id,
      version: paid.row.row.version,
      patch: { obligationCounterpartyId: MAREK },
    });
    expect(linkOf(paid.row.row.id)).toBe(readOpeningDebts(s.ledger.replica.db, MAREK)[0]?.id);
  });

  it("clears the link, without an error, when the debt role is taken away", () => {
    recordOpening();
    const paid = settle({ amount: "50", discharges: { currency: "PLN", amount: "50" } });
    expect(() =>
      write(updateTransactionExecutor, {
        id: paid.row.row.id,
        version: paid.row.row.version,
        patch: { obligationRole: null, obligationCounterpartyId: null },
      }),
    ).not.toThrow();
    expect(linkOf(paid.row.row.id)).toBeNull();
  });

  it("is carried across when the repayment is replaced", () => {
    recordOpening();
    const paid = settle({ amount: "50", discharges: { currency: "PLN", amount: "50" } });
    const replacementId = nextId();
    write(supersedeTransactionExecutor, {
      supersedesId: paid.row.row.id,
      supersedesVersion: paid.row.row.version,
      replacement: {
        id: replacementId,
        date: "2026-09-02",
        type: "income",
        accountId: ACCOUNT,
        amountOriginal: "50",
        currency: "PLN",
        counterpartyId: NINA,
        obligationCounterpartyId: NINA,
        obligationRole: "debt",
        enteredName: "Nina",
      },
    });
    expect(linkOf(replacementId)).toBe(readOpeningDebts(s.ledger.replica.db, NINA)[0]?.id);
  });
});

describe("a repayment of an existing debt, in the Who card", () => {
  it("is not counted: neither spending nor income", () => {
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "80" });
    const query = {
      kind: "who" as const,
      counterpartyId: MAREK,
      type: "expense" as const,
      currency: PLN,
      from: accountingDate("2026-01-01"),
      to: accountingDate("2026-12-31"),
    };
    const before = readContextRows(s.ledger.replica.db, query).length;
    settle({
      counterpartyId: MAREK,
      type: "expense",
      amount: "30",
      discharges: { currency: "PLN", amount: "30" },
    });
    expect(readContextRows(s.ledger.replica.db, query)).toHaveLength(before);
  });
});

describe("unmerge keeps a correction made after the merge", () => {
  it("merge 200 + 50 owed back, re-record the winner at 999, unmerge: 999 stays and it is said", () => {
    recordOpening({ amount: "100" });
    recordOpening({ counterpartyId: MAREK, direction: "youOwe", amount: "50" });
    const merged = write(mergeCounterpartiesExecutor, {
      mergeId: id<"counterpartyMerges">(nextId()),
      winnerId: NINA,
      loserId: MAREK,
      movedTransactionIds: [],
    });
    recordOpening({ amount: "999" });

    const result = write(unmergeCounterpartiesExecutor, { mergeId: merged.row.merge.id });

    expect(result.row.existingDebtsKept).toBe(1);
    expect(balanceOf(NINA, "PLN")).toBe(money.toMoney("999"));
    // The loser is not handed a debt the winner's figure still includes.
    expect(balanceOf(MAREK, "PLN")).toBeUndefined();
  });
});
