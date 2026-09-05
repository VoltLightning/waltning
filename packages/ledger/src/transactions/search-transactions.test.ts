import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import {
  SEARCH_PAGE_SIZE,
  searchTransactions,
  type TransactionSearchCursor,
} from "./search-transactions.ts";

const { accounts, categories, counterparties, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");

const OWN = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const SHARED = id<"accounts">("00000000-0000-4000-8000-00000000000b");
const USD_ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000c");

const FOOD = id<"categories">("00000000-0000-4000-8000-0000000000c1");
const TRAVEL = id<"categories">("00000000-0000-4000-8000-0000000000c2");

let stores: ScratchStores;

type ExpenseOverrides = Omit<Partial<typeof transactions.$inferInsert>, "id"> & { id?: string };

/** One live expense row, everything else defaulted, close to `read-recent.test.ts`'s shape. */
function insertExpense(overrides: ExpenseOverrides = {}) {
  const { id: rawId, ...rest } = overrides;
  const values = {
    date: accountingDate("2026-08-20"),
    type: "expense" as const,
    accountId: OWN,
    categoryId: FOOD,
    amountOriginal: money.toMoney("10"),
    currency: PLN,
    fxRate: money.pivotPerUnit("1"),
    payee: "Placeholder",
    note: "",
    isBusiness: false,
    isCapital: false,
    ...rest,
    id: id<"transactions">(rawId ?? crypto.randomUUID()),
  };
  stores.ledger.replica.db.insert(transactions).values(values).run();
  return values.id;
}

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values([
      { code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true },
      { code: USD, name: "US dollar", symbol: "$", decimals: 2 },
    ])
    .run();
  db.insert(accounts)
    .values([
      { id: OWN, name: "Bank A · PLN", currency: PLN, ownership: "own" },
      { id: SHARED, name: "Household · PLN", currency: PLN, ownership: "shared" },
      { id: USD_ACCOUNT, name: "Wallet · USD", currency: USD, ownership: "own" },
    ])
    .run();
  db.insert(categories)
    .values([
      { id: FOOD, name: "Groceries", kind: "expense", isLeaf: true },
      { id: TRAVEL, name: "Travel", kind: "expense", isLeaf: true },
    ])
    .run();
});

describe("searchTransactions — text", () => {
  it("matches folded, diacritic-insensitive payee and note", () => {
    insertExpense({ payee: "Żabka", note: "poranna kawa" });

    expect(searchTransactions(stores.ledger.replica.db, { text: "zabka" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "ŻABKA" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "kawa" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "nope" }).rows).toHaveLength(0);
  });

  it("matches an amount exactly, in either decimal mark, and never by digits (§13)", () => {
    insertExpense({ payee: "Rewe", amountOriginal: money.toMoney("48.90") });
    insertExpense({ payee: "Landlord", amountOriginal: money.toMoney("1489.00") });

    const payees = (text: string) =>
      searchTransactions(stores.ledger.replica.db, { text }).rows.map((row) => row.payee);
    expect(payees("48,90")).toEqual(["Rewe"]);
    expect(payees("48.90")).toEqual(["Rewe"]);
    // A substring of the digits is not the amount — and it must not reach the
    // running total either, which folds over the same filtered rows.
    expect(payees("489")).toEqual([]);
    expect(payees("4890")).toEqual([]);
    expect(payees("999")).toEqual([]);
  });

  it("never lets a purely alphabetic query match on amount alone", () => {
    insertExpense({ payee: "Costa" });

    // No digit in the needle — the amount check must not fire on an empty
    // digit string, or every row would match every text search.
    expect(searchTransactions(stores.ledger.replica.db, { text: "zzz" }).rows).toHaveLength(0);
  });
});

describe("searchTransactions — structural filters, alone and combined", () => {
  beforeEach(() => {
    insertExpense({
      id: "00000000-0000-4000-8000-000000000001",
      payee: "Groceries own",
      accountId: OWN,
      categoryId: FOOD,
      date: accountingDate("2026-08-01"),
    });
    insertExpense({
      id: "00000000-0000-4000-8000-000000000002",
      payee: "Business lunch",
      accountId: OWN,
      categoryId: TRAVEL,
      isBusiness: true,
      date: accountingDate("2026-08-10"),
    });
    insertExpense({
      id: "00000000-0000-4000-8000-000000000003",
      payee: "Shared groceries",
      accountId: SHARED,
      categoryId: FOOD,
      date: accountingDate("2026-08-15"),
    });
  });

  it("filters by account", () => {
    const result = searchTransactions(stores.ledger.replica.db, { accountIds: [SHARED] });
    expect(result.rows.map((r) => r.payee)).toEqual(["Shared groceries"]);
  });

  it("filters by category", () => {
    const result = searchTransactions(stores.ledger.replica.db, { categoryIds: [TRAVEL] });
    expect(result.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
  });

  it("filters by scope — mine, business, shared partition the set", () => {
    const mine = searchTransactions(stores.ledger.replica.db, { scope: "mine" });
    const business = searchTransactions(stores.ledger.replica.db, { scope: "business" });
    const shared = searchTransactions(stores.ledger.replica.db, { scope: "shared" });
    const all = searchTransactions(stores.ledger.replica.db, { scope: "all" });

    expect(mine.rows.map((r) => r.payee)).toEqual(["Groceries own"]);
    expect(business.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
    expect(shared.rows.map((r) => r.payee)).toEqual(["Shared groceries"]);
    expect(mine.rows.length + business.rows.length + shared.rows.length).toBe(all.rows.length);
  });

  it("filters by date range", () => {
    const result = searchTransactions(stores.ledger.replica.db, {
      from: accountingDate("2026-08-05"),
      to: accountingDate("2026-08-12"),
    });
    expect(result.rows.map((r) => r.payee)).toEqual(["Business lunch"]);
  });

  it("filters by counterparty — E4's S13 history, any role", () => {
    const nina = id<"counterparties">("00000000-0000-4000-8000-0000000000d1");
    stores.ledger.replica.db
      .insert(counterparties)
      .values([{ id: nina, name: "Nina", nameFolded: "nina", kind: "person" }])
      .run();
    insertExpense({
      id: "00000000-0000-4000-8000-000000000004",
      payee: "Lent for tickets",
      counterpartyId: nina,
      counterpartyRole: "debt",
      date: accountingDate("2026-08-20"),
    });

    const result = searchTransactions(stores.ledger.replica.db, { counterpartyId: nina });
    expect(result.rows.map((r) => r.payee)).toEqual(["Lent for tickets"]);
    expect(result.rows[0]?.counterpartyRole).toBe("debt");
  });

  it("filters by counterparty role — S13's debts-only default", () => {
    const nina = id<"counterparties">("00000000-0000-4000-8000-0000000000d2");
    stores.ledger.replica.db
      .insert(counterparties)
      .values([{ id: nina, name: "Nina", nameFolded: "nina", kind: "person" }])
      .run();
    insertExpense({
      id: "00000000-0000-4000-8000-000000000005",
      payee: "Dinner, split four ways",
      counterpartyId: nina,
      counterpartyRole: "debt",
      date: accountingDate("2026-08-06"),
    });
    insertExpense({
      id: "00000000-0000-4000-8000-000000000006",
      payee: "Just involved",
      counterpartyId: nina,
      counterpartyRole: "reference",
      date: accountingDate("2026-08-07"),
    });

    const debtOnly = searchTransactions(stores.ledger.replica.db, {
      counterpartyId: nina,
      counterpartyRole: "debt",
    });
    const every = searchTransactions(stores.ledger.replica.db, { counterpartyId: nina });
    expect(debtOnly.rows.map((r) => r.payee)).toEqual(["Dinner, split four ways"]);
    expect(every.rows.length).toBe(2);
  });

  it("combines every filter with AND", () => {
    const result = searchTransactions(stores.ledger.replica.db, {
      text: "groceries",
      categoryIds: [FOOD],
      scope: "mine",
      from: accountingDate("2026-07-01"),
      to: accountingDate("2026-08-31"),
    });
    expect(result.rows.map((r) => r.payee)).toEqual(["Groceries own"]);
  });
});

describe("searchTransactions — paging", () => {
  it("returns every live row exactly once across pages, in (date, id) keyset order", () => {
    const total = SEARCH_PAGE_SIZE + 5;
    for (let i = 0; i < total; i++) {
      insertExpense({
        id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: accountingDate(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      });
    }

    const seen: string[] = [];
    let cursor: TransactionSearchCursor | undefined;
    let pages = 0;
    for (;;) {
      const page = searchTransactions(stores.ledger.replica.db, {}, cursor);
      seen.push(...page.rows.map((r) => r.id));
      pages += 1;
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
      expect(pages).toBeLessThan(20); // guard against an infinite loop on a bug
    }

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(pages).toBe(Math.ceil(total / SEARCH_PAGE_SIZE));
  });

  /**
   * M2 — the page query pushes `LIMIT` into SQL rather than reading every
   * matching row and slicing a page off in JS. 200 rows, page size 50:
   * counting the rows the page returns would pass either way (both
   * implementations answer 50), so this inspects the SQL SQLite actually
   * executes instead, via `better-sqlite3`'s own `prepare` — the one call
   * both paths must go through.
   */
  it("pushes a LIMIT into the page query, for a text-free filter", () => {
    for (let i = 0; i < 200; i++) {
      insertExpense({
        id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: accountingDate(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      });
    }

    const prepareSpy = vi.spyOn(Database.prototype, "prepare");
    searchTransactions(stores.ledger.replica.db, {});
    const statements = prepareSpy.mock.calls.map(([sql]) => String(sql));
    prepareSpy.mockRestore();

    expect(statements.some((sql) => /\blimit\b/i.test(sql))).toBe(true);
  });

  /**
   * L — `total.count` is `totalRows.length`: `totalRows` is read in full
   * regardless, to fold the currency sums beside it, so a second `count(*)`
   * over the same filter would be a pure pessimization rather than a real
   * saving — one query, no `LIMIT`, one honest count.
   */
  it("counts the total from the same rows the currency sums fold, for a text-free filter", () => {
    for (let i = 0; i < 5; i++) {
      insertExpense({
        id: `40000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: accountingDate(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      });
    }

    const result = searchTransactions(stores.ledger.replica.db, {});

    expect(result.total.count).toBe(5);
  });
});

describe("searchTransactions — totals", () => {
  it("sums per currency, splits out capital, and never mixes currencies", () => {
    insertExpense({
      id: "20000000-0000-4000-8000-000000000001",
      accountId: OWN,
      amountOriginal: money.toMoney("100"),
      currency: PLN,
      isCapital: false,
    });
    insertExpense({
      id: "20000000-0000-4000-8000-000000000002",
      accountId: OWN,
      amountOriginal: money.toMoney("5000"),
      currency: PLN,
      isCapital: true,
    });
    insertExpense({
      id: "20000000-0000-4000-8000-000000000003",
      accountId: USD_ACCOUNT,
      amountOriginal: money.toMoney("20"),
      currency: USD,
      isCapital: false,
    });

    const result = searchTransactions(stores.ledger.replica.db, {});
    expect(result.total.count).toBe(3);

    const pln = result.total.currencies.find((c) => c.currency === PLN);
    const usd = result.total.currencies.find((c) => c.currency === USD);
    expect(pln).toMatchObject({
      sum: "-5100.00000000",
      sumExcludingCapital: "-100.00000000",
      capitalCount: 1,
    });
    expect(usd).toMatchObject({
      sum: "-20.00000000",
      sumExcludingCapital: "-20.00000000",
      capitalCount: 0,
    });
  });
});

describe("searchTransactions — transfers", () => {
  it("counts a transfer once, and folds its two legs into two currency totals", () => {
    stores.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">("30000000-0000-4000-8000-000000000001"),
        date: accountingDate("2026-08-20"),
        type: "transfer",
        accountId: OWN,
        toAccountId: USD_ACCOUNT,
        amountOriginal: money.toMoney("125"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
        toAmount: money.toMoney("31.25"),
        toCurrency: USD,
        payee: "",
        note: "",
      })
      .run();

    const byOwn = searchTransactions(stores.ledger.replica.db, { accountIds: [OWN] });
    const byUsd = searchTransactions(stores.ledger.replica.db, { accountIds: [USD_ACCOUNT] });
    const all = searchTransactions(stores.ledger.replica.db, {});

    expect(byOwn.rows).toHaveLength(1);
    expect(byUsd.rows).toHaveLength(1);
    expect(byOwn.rows[0]?.id).toBe(byUsd.rows[0]?.id);
    expect(all.total.count).toBe(1);

    const pln = all.total.currencies.find((c) => c.currency === PLN);
    const usd = all.total.currencies.find((c) => c.currency === USD);
    expect(pln?.sum).toBe("-125.00000000");
    expect(usd?.sum).toBe("31.25000000");

    const row = all.rows[0];
    expect(row?.toAccountName).toBe("Wallet · USD");
    expect(row?.toAmount).toBe("31.25000000");
  });
});
