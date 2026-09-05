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

const { accounts, categories, counterparties, currencies, transactionLines, transactions } =
  ledgerSchema;

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
    // An invented name, and one carrying three of the diacritics `fold()` maps
    // — Ż, ó and ł — so the fold is what the assertions below actually test.
    insertExpense({ payee: "Sklep Żółty", note: "poranna kawa" });

    expect(searchTransactions(stores.ledger.replica.db, { text: "zolty" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "ŻÓŁTY" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "kawa" }).rows).toHaveLength(1);
    expect(searchTransactions(stores.ledger.replica.db, { text: "nope" }).rows).toHaveLength(0);
  });

  it("matches an amount exactly, in either decimal mark, and never by digits (§13)", () => {
    insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("48.90") });
    insertExpense({ payee: "Landlord", amountOriginal: money.toMoney("1489.00") });

    const payees = (text: string) =>
      searchTransactions(stores.ledger.replica.db, { text }).rows.map((row) => row.payee);
    expect(payees("48,90")).toEqual(["Shop A"]);
    expect(payees("48.90")).toEqual(["Shop A"]);
    // A substring of the digits is not the amount — and it must not reach the
    // running total either, which folds over the same filtered rows.
    expect(payees("489")).toEqual([]);
    expect(payees("4890")).toEqual([]);
    expect(payees("999")).toEqual([]);
  });

  /**
   * M6 — a query naming a payee is text-only, even when a number sits in it.
   *
   * `@waltning/core/capture/amount`'s `findAmount` reads the first number
   * *inside* free text, which is right for quick-add and wrong here: it let a
   * payee-and-year query silently also filter by amount. `parseSearchAmount`
   * (`search-transactions.ts`) requires the whole query to be the amount.
   */
  it("does not read an amount out of a query that also names a payee (§13, M6)", () => {
    // The row is seeded at exactly the number sitting in the query, which is
    // what makes this a real regression test: nothing here matches on text
    // ("shop a 2024" is not a substring of the payee "Shop A", which is the
    // whole point of a *substring* match), so the only way this row could
    // come back is an amount clause reading "2024" out of the middle of the
    // query — which is what capture's `findAmount` did before M6.
    insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("2024") });
    insertExpense({ payee: "Shop B", amountOriginal: money.toMoney("999") });

    expect(searchTransactions(stores.ledger.replica.db, { text: "Shop A 2024" }).rows).toHaveLength(
      0,
    );

    // And the bare amount still matches, so the clause was narrowed, not lost.
    expect(
      searchTransactions(stores.ledger.replica.db, { text: "2024" }).rows.map((row) => row.payee),
    ).toEqual(["Shop A"]);
  });

  /**
   * `parseSearchAmount`'s own grammar, which is deliberately **not** capture's.
   *
   * `findAmount` groups thousands in threes (`\d{1,3}(?: \d{3})*`), so a bare
   * ungrouped "1500" parses there as `150` and "12345" as `123`. Reading a
   * search box through that grammar meant typing an amount with no separator
   * — the ordinary way to type one — returned rows worth a tenth or a
   * hundredth of what was asked for. A search query is not a captured phrase;
   * it gets its own reader, and these four are what it must answer.
   */
  it("reads an ungrouped amount whole — 1500 is not 150 (§13)", () => {
    insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("1500") });
    insertExpense({ payee: "Shop B", amountOriginal: money.toMoney("150") });
    insertExpense({ payee: "Shop C", amountOriginal: money.toMoney("2024") });
    insertExpense({ payee: "Shop D", amountOriginal: money.toMoney("12345") });

    const payees = (text: string) =>
      searchTransactions(stores.ledger.replica.db, { text }).rows.map((row) => row.payee);

    expect(payees("1500")).toEqual(["Shop A"]);
    expect(payees("2024")).toEqual(["Shop C"]);
    expect(payees("12345")).toEqual(["Shop D"]);
    // Grouping is whitespace and the decimal mark is a comma or a point, so
    // the separated spelling of the same amount finds the same row.
    expect(payees("1 500,00")).toEqual(["Shop A"]);
    expect(payees("1\u00a0500,00")).toEqual(["Shop A"]);
    expect(payees("1500.00")).toEqual(["Shop A"]);
  });

  /**
   * The two spellings §13 refuses, pinned so the refusal is a decision.
   *
   * `"48,90 zł"` and `"1.500,00"` are both amounts a person could reasonably
   * type, and both are text here. §13 says why: a trailing token cannot be
   * told from an ordinary payee word without the ledger's whole currency
   * list, and a point cannot be told from a decimal mark without knowing what
   * was meant. A grammar loose enough for the first is loose enough to make
   * `"100 lat"` match every row at `100,00` — M6, one spelling later. So the
   * amount clause stays silent and the substring match answers alone, which
   * for these queries means nothing.
   */
  it("leaves a currency token and a point-grouped amount as text (§13)", () => {
    insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("48.90") });
    insertExpense({ payee: "Shop B", amountOriginal: money.toMoney("1500") });
    // The payee that makes the currency-token case dangerous rather than
    // merely unhelpful: a real word beside a number.
    insertExpense({ payee: "Shop C", amountOriginal: money.toMoney("100") });

    const payees = (text: string) =>
      searchTransactions(stores.ledger.replica.db, { text }).rows.map((row) => row.payee);

    expect(payees("48,90 zł")).toEqual([]);
    expect(payees("1.500,00")).toEqual([]);
    expect(payees("100 lat")).toEqual([]);

    // The spellings §13 does accept still find the same rows, so this pins a
    // boundary rather than a broken parser.
    expect(payees("48,90")).toEqual(["Shop A"]);
    expect(payees("1 500,00")).toEqual(["Shop B"]);
  });

  /**
   * M1 — the two rules that make a space and a decimal mark readable.
   *
   * A space is grouping only where grouping belongs. `"1 500"` is fifteen
   * hundred; `"1 5 0 0"` is four digits a person spaced out for some other
   * reason, and stripping every space would have made it the same amount. And
   * `"1.500"` is refused rather than guessed: it is one-and-a-half under one
   * convention and fifteen hundred under the other, and the query carries no
   * grouping space to settle it. §13 states both.
   */
  it("groups only at grouping positions, and refuses the ambiguous tail (§13)", () => {
    insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("1500") });
    insertExpense({ payee: "Shop B", amountOriginal: money.toMoney("1.5") });
    insertExpense({ payee: "Shop C", amountOriginal: money.toMoney("0.05") });

    const payees = (text: string) =>
      searchTransactions(stores.ledger.replica.db, { text }).rows.map((row) => row.payee);

    // Grouping at a grouping position is dropped.
    expect(payees("1 500")).toEqual(["Shop A"]);
    // Spaces anywhere else are not grouping, so the query is text and matches
    // no payee — note it would be `1500` if every space were simply stripped.
    expect(payees("1 5 0 0")).toEqual([]);
    // Ambiguous between 1,5 and 1500, so neither row comes back.
    expect(payees("1.500")).toEqual([]);
    expect(payees("1,500")).toEqual([]);
    // A decimal mark with one or two digits after it is unambiguous.
    expect(payees("1,5")).toEqual(["Shop B"]);
    expect(payees("0,05")).toEqual(["Shop C"]);
    // And a grouping space settles the mark, so three decimals read fine.
    expect(payees("1 500,000")).toEqual(["Shop A"]);
  });

  it("never lets a purely alphabetic query match on amount alone", () => {
    insertExpense({ payee: "Corner Café" });

    // No digit in the needle — the amount check must not fire on an empty
    // digit string, or every row would match every text search.
    expect(searchTransactions(stores.ledger.replica.db, { text: "zzz" }).rows).toHaveLength(0);
  });

  /**
   * H2 — §13: trigram runs "over `payee`, `note`, `receipts.merchant` and
   * `transaction_lines.description`". The phone's substring match had the
   * first two and skipped the fourth entirely, so a line-only word like
   * "toner" found nothing even though the row it belongs to was live on the
   * replica the whole time.
   */
  it("matches a word that lives only in a line's own description", () => {
    const txnId = insertExpense({ payee: "Shop A", amountOriginal: money.toMoney("48.90") });
    stores.ledger.replica.db
      .insert(transactionLines)
      .values({
        id: id<"transactionLines">("00000000-0000-4000-8000-0000000000e1"),
        transactionId: txnId,
        description: "Printer toner",
        amount: money.toMoney("48.90"),
      })
      .run();

    const result = searchTransactions(stores.ledger.replica.db, { text: "toner" });

    expect(result.rows.map((row) => row.id)).toEqual([txnId]);
    expect(result.total).toEqual({
      count: 1,
      currencies: [
        {
          currency: PLN,
          decimals: 2,
          sum: "-48.90000000",
          sumExcludingCapital: "-48.90000000",
          capitalCount: 0,
        },
      ],
    });
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

/**
 * M3 (DESK3 round 3) — the mode S10 §4's exclusion counts ask through.
 *
 * The class of defect is not a wrong number; it is the *cost* of a right
 * one. Each of those counts reads `total.count` and nothing else, and asking
 * through the full operation folded every matching row through `decimal.js`
 * for currency sums that are then discarded — over a set deliberately wider
 * than the one on screen, and for the date range's own note, over the whole
 * ledger. So the two properties below are "the count is the same figure" and
 * "the fold does not run", and the second one is stated against the SQL
 * actually prepared rather than against a timing.
 */
describe("searchTransactions — countOnly", () => {
  it("counts the same rows the full operation counts, and returns nothing else", () => {
    for (let i = 0; i < 7; i++) {
      insertExpense({
        id: `50000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: accountingDate(`2026-01-${String(i + 1).padStart(2, "0")}`),
      });
    }
    // One row outside the filter, to prove the `WHERE` is the same `WHERE`.
    insertExpense({
      id: "50000000-0000-4000-8000-0000000000ff",
      date: accountingDate("2026-03-01"),
    });

    const filter = { from: accountingDate("2026-01-01"), to: accountingDate("2026-01-31") };
    const full = searchTransactions(stores.ledger.replica.db, filter);
    const counted = searchTransactions(stores.ledger.replica.db, filter, undefined, {
      countOnly: true,
    });

    expect(counted.total.count).toBe(full.total.count);
    expect(counted.total.count).toBe(7);
    // No page, no cursor, and no currency totals — a caller wanting any of
    // those must not ask for a count.
    expect(counted.rows).toEqual([]);
    expect(counted.nextCursor).toBeUndefined();
    expect(counted.total.currencies).toEqual([]);
    expect(full.total.currencies.length).toBeGreaterThan(0);
  });

  /**
   * The fold, from the outside: `signRow` and `totalsOf` read
   * `amount_original` and nothing else can give them a number, so a query
   * that does not select it cannot have folded one. `better-sqlite3`'s own
   * `prepare` is the seam both paths go through — the same spy the `LIMIT`
   * test above uses.
   */
  it("prepares one COUNT and never selects an amount to fold", () => {
    for (let i = 0; i < 200; i++) {
      insertExpense({
        id: `60000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        date: accountingDate(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      });
    }

    const prepareSpy = vi.spyOn(Database.prototype, "prepare");
    searchTransactions(stores.ledger.replica.db, {}, undefined, { countOnly: true });
    const statements = prepareSpy.mock.calls.map(([sql]) => String(sql));
    prepareSpy.mockRestore();

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/count\(\*\)/i);
    expect(statements.some((sql) => /amount_original/i.test(sql))).toBe(false);
  });

  /**
   * A `text` filter still cannot be decided in SQL, so its own query reads
   * rows — but only the three columns `matchesText` folds by *name*. The
   * money fold is what count-only drops, everywhere.
   */
  it("a text filter counts by folding names, still without folding money", () => {
    insertExpense({ payee: "Żabka", note: "poranna kawa" });
    insertExpense({ payee: "Rewe", note: "" });

    const prepareSpy = vi.spyOn(Database.prototype, "prepare");
    const counted = searchTransactions(stores.ledger.replica.db, { text: "zabka" }, undefined, {
      countOnly: true,
    });
    const statements = prepareSpy.mock.calls.map(([sql]) => String(sql));
    prepareSpy.mockRestore();

    expect(counted.total.count).toBe(1);
    expect(counted.total.currencies).toEqual([]);
    expect(statements).toHaveLength(1);
    // `amount_original` *is* selected here — §13 matches an amount token
    // exactly — but nothing sums it: no currency total comes back.
    expect(statements.some((sql) => /"to_amount"/i.test(sql))).toBe(false);
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

/**
 * L — pins the tie-break `(date, id)` order both branches promise (this
 * file's own doc on `searchTransactions`): newest date first, and id
 * descending among rows sharing a date. Two ids on the same date sort
 * lexicographically, never by insertion order, in both the plain listing
 * (SQL `ORDER BY`) and a `text` search (the same rows, filtered in JS,
 * order untouched by the filter).
 */
describe("searchTransactions — offline ordering (date desc, id desc)", () => {
  beforeEach(() => {
    insertExpense({
      id: "00000000-0000-4000-8000-00000000d001",
      payee: "Shop toner run",
      date: accountingDate("2026-08-20"),
    });
    insertExpense({
      id: "00000000-0000-4000-8000-00000000d002",
      payee: "Shop toner run",
      date: accountingDate("2026-08-20"),
    });
    insertExpense({
      id: "00000000-0000-4000-8000-00000000d000",
      payee: "Shop toner run",
      date: accountingDate("2026-08-21"),
    });
  });

  it("orders the plain listing by date desc, then id desc", () => {
    const result = searchTransactions(stores.ledger.replica.db, {});
    expect(result.rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-00000000d000",
      "00000000-0000-4000-8000-00000000d002",
      "00000000-0000-4000-8000-00000000d001",
    ]);
  });

  it("keeps the same order once a text filter narrows the set in JS", () => {
    const result = searchTransactions(stores.ledger.replica.db, { text: "toner" });
    expect(result.rows.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-00000000d000",
      "00000000-0000-4000-8000-00000000d002",
      "00000000-0000-4000-8000-00000000d001",
    ]);
  });
});
