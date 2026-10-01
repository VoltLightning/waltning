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
import { eq, getTableColumns } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { readNetWorth } from "../accounts/read-net-worth.ts";
import { readCounterpartyBalances } from "../counterparties/read-counterparty-balances.ts";
import { readOpeningDebts } from "../counterparties/read-opening-debts.ts";
import { recordOpeningDebtExecutor } from "../counterparties/record-opening-debt.executor.ts";
import { settleDebtExecutor } from "../counterparties/settle-debt.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { readPeriodSpend } from "../transactions/read-period-spend.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { counterparties, openingDebts, transactions } = schema;

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
    ...over,
  });
}

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
    expect(rows[0]?.id, "the row keeps the id it was first written with").toBe(first.row.id);
    expect(second.row.id).toBe(first.row.id);
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
