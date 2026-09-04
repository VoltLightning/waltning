import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readCounterpartyBalances } from "./read-counterparty-balances.ts";

const { accounts, counterparties, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const BANK = id<"accounts">("11111111-1111-4111-8111-111111111111");
const NINA = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const ACME = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const TODAY = accountingDate("2026-09-10");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values([
      { code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true },
      { code: EUR, name: "Euro", symbol: "€", decimals: 2, isPivot: false },
    ])
    .run();
  db.insert(accounts).values({ id: BANK, name: "Bank A · PLN", currency: PLN, kind: "bank" }).run();
  db.insert(counterparties)
    .values([
      { id: NINA, name: "Nina", nameFolded: "nina", kind: "person" },
      { id: ACME, name: "Acme", nameFolded: "acme", kind: "company" },
    ])
    .run();
});

afterEach(() => stores.close());

const txn = (overrides: {
  id: ReturnType<typeof id<"transactions">>;
  date: ReturnType<typeof accountingDate>;
  type: "income" | "expense";
  amountOriginal: money.Money;
  counterpartyId: ReturnType<typeof id<"counterparties">>;
  counterpartyRole?: "debt" | "contribution" | "reference";
  deletedAt?: Date;
  currency?: money.CurrencyCode;
  debtCurrency?: money.CurrencyCode;
  debtAmount?: money.Money;
}) => ({
  accountId: BANK,
  currency: PLN,
  fxRate: money.pivotPerUnit("1"),
  counterpartyRole: "debt" as const,
  ...overrides,
});

describe("readCounterpartyBalances — §6.6's own table, four events in turn", () => {
  it("lend 200 → +200 (they owe you)", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      )
      .run();
    expect(readCounterpartyBalances(db, TODAY)).toEqual([
      {
        counterpartyId: NINA,
        name: "Nina",
        kind: "person",
        settlementCurrency: null,
        currency: PLN,
        decimals: 2,
        balance: "200.00000000",
        ageDays: null,
        bucket: null,
      },
    ]);
  });

  it("… they repay 200 → 0", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-10"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      ])
      .run();
    expect(readCounterpartyBalances(db, TODAY)[0]?.balance).toBe("0.00000000");
  });

  it("… you borrow 200 → −200 (you owe them)", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-10"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-08-15"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      ])
      .run();
    expect(readCounterpartyBalances(db, TODAY)[0]?.balance).toBe("-200.00000000");
  });

  it("… you repay 200 → 0 again", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-10"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-08-15"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
          date: accountingDate("2026-08-20"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      ])
      .run();
    expect(readCounterpartyBalances(db, TODAY)[0]?.balance).toBe("0.00000000");
  });
});

describe("readCounterpartyBalances — ageing, companies only (O15)", () => {
  it("never ages a person, even with an open balance", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      )
      .run();
    const row = readCounterpartyBalances(db, TODAY)[0];
    expect(row?.ageDays).toBeNull();
    expect(row?.bucket).toBeNull();
  });

  it("ages a company from the oldest still-open row, in days to today", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("500"),
          counterpartyId: ACME,
        }),
      )
      .run();
    const row = readCounterpartyBalances(db, TODAY)[0];
    // 2026-08-01 → 2026-09-10 is 40 days.
    expect(row?.ageDays).toBe(40);
    expect(row?.bucket).toBe("31-60");
  });

  it("ages from the oldest OPEN row once a partial settlement consumes the older one", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-07-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: ACME,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-15"),
          type: "expense",
          amountOriginal: money.toMoney("300"),
          counterpartyId: ACME,
        }),
        txn({
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-08-20"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: ACME,
        }),
      ])
      .run();
    const row = readCounterpartyBalances(db, TODAY)[0];
    // The 200 lent 2026-07-01 is fully consumed by the 200 repaid; the
    // still-open row is the 300 lent 2026-08-15 → 26 days to 2026-09-10.
    expect(row?.balance).toBe("300.00000000");
    expect(row?.ageDays).toBe(26);
    expect(row?.bucket).toBe("0-30");
  });
});

describe("readCounterpartyBalances — structural exclusions", () => {
  it("never a contribution or reference row (§6.6, §6.7)", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
          counterpartyRole: "contribution",
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-02"),
          type: "expense",
          amountOriginal: money.toMoney("30"),
          counterpartyId: NINA,
          counterpartyRole: "reference",
        }),
      ])
      .run();
    expect(readCounterpartyBalances(db, TODAY)).toEqual([]);
  });

  it("an archived counterparty AT ZERO — excluded, hidden from pickers per SPEC.md", () => {
    const db = stores.ledger.replica.db;
    db.update(counterparties).set({ archived: true }).run();
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-10"),
          type: "income",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      ])
      .run();
    expect(readCounterpartyBalances(db, TODAY)).toEqual([]);
  });

  it("an archived counterparty with a NON-ZERO balance — still visible, history keeps working", () => {
    // E2's archive gate refuses `update_counterparty` while a balance is
    // open, so an archived counterparty is normally settled — but a
    // relationship archived before this PR's coalesce fix landed (or one
    // archived by a path that bypasses the gate) can still carry one.
    // SPEC.md: archiving hides from pickers, history keeps working — a
    // non-zero balance is history that still needs to be seen.
    const db = stores.ledger.replica.db;
    db.update(counterparties).set({ archived: true }).where(eq(counterparties.id, NINA)).run();
    db.insert(transactions)
      .values(
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
      )
      .run();
    const rows = readCounterpartyBalances(db, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.balance).toBe("200.00000000");
  });

  it("never a soft-deleted transaction", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
          deletedAt: new Date(),
        }),
      )
      .run();
    expect(readCounterpartyBalances(db, TODAY)).toEqual([]);
  });

  it("keeps a person's and a company's balances in the same currency separate", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-02"),
          type: "expense",
          amountOriginal: money.toMoney("500"),
          counterpartyId: ACME,
        }),
      ])
      .run();
    const rows = readCounterpartyBalances(db, TODAY);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.counterpartyId === NINA)?.balance).toBe("200.00000000");
    expect(rows.find((r) => r.counterpartyId === ACME)?.balance).toBe("500.00000000");
  });
});

describe("readCounterpartyBalances — a settlement's own currency and amount (S14)", () => {
  it("a settlement discharges debt_amount in debt_currency, never the leg's own amount", () => {
    // Lent 200 PLN. Settled by paying 50 EUR that discharges 214.05 PLN —
    // `debt_currency`/`debt_amount` name what the settlement actually
    // clears, in the debt's own currency, not what changed hands. Folding
    // the leg's own 50 (in the wrong currency entirely) instead of the
    // coalesced 214.05 PLN is exactly the bug this guards.
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        txn({
          id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          date: accountingDate("2026-08-01"),
          type: "expense",
          amountOriginal: money.toMoney("200"),
          counterpartyId: NINA,
        }),
        txn({
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-10"),
          type: "income",
          amountOriginal: money.toMoney("50"),
          currency: EUR,
          debtCurrency: PLN,
          debtAmount: money.toMoney("214.05"),
          counterpartyId: NINA,
        }),
      ])
      .run();
    const rows = readCounterpartyBalances(db, TODAY);
    // 200 lent, 214.05 discharged — the PLN balance goes negative (over-
    // settled), never the 200 − 50 = 150 the un-coalesced leg amount gives.
    expect(rows).toEqual([
      {
        counterpartyId: NINA,
        name: "Nina",
        kind: "person",
        settlementCurrency: null,
        currency: PLN,
        decimals: 2,
        balance: "-14.05000000",
        ageDays: null,
        bucket: null,
      },
    ]);
  });
});
