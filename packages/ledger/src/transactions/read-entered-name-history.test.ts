import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readEnteredNameHistory } from "./read-entered-name-history.ts";

const { accounts, categories, currencies, transactions } = ledgerSchema;

const USD = currencyCode("USD");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const GROCERIES = id<"categories">("22222222-2222-4222-8222-222222222222");
const DINING = id<"categories">("33333333-3333-4333-8333-333333333333");
const RETIRED = id<"categories">("44444444-4444-4444-8444-444444444444");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Wallet · USD", currency: USD }).run();
  db.insert(categories)
    .values([
      { id: GROCERIES, name: "Groceries", kind: "expense", isLeaf: true },
      { id: DINING, name: "Dining", kind: "expense", isLeaf: true },
      // Live at seed time, archived by the tests that need it — which is the
      // only way a row can sit on an archived category at all: the replica's
      // own `transactions_category_not_archived_insert` refuses the write
      // otherwise (H1a).
      { id: RETIRED, name: "Retired", kind: "expense", isLeaf: true },
    ])
    .run();
});

afterEach(() => stores.close());

/** Retires a category the way S07 does — after the rows that already sit on it were written. */
function archive(categoryId: typeof RETIRED) {
  stores.ledger.replica.db
    .update(categories)
    .set({ archived: true })
    .where(eq(categories.id, categoryId))
    .run();
}

const baseRow = (index: number) => ({
  id: id<"transactions">(`00000000-0000-4000-8000-00000000000${index}`),
  type: "expense" as const,
  accountId: ACCOUNT,
  amountOriginal: money.toMoney("10"),
  currency: USD,
  fxRate: money.pivotPerUnit("1"),
  createdAt: new Date(`2026-08-01T10:00:0${index}Z`),
});

describe("readEnteredNameHistory", () => {
  it("keeps one row per folded enteredName, its most recent category and date", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          enteredName: "Coffee House",
          categoryId: DINING,
        },
        {
          ...baseRow(1),
          date: accountingDate("2026-08-02"),
          enteredName: "COFFEE HOUSE",
          categoryId: GROCERIES,
        },
      ])
      .run();

    const history = readEnteredNameHistory(db);

    expect(history).toEqual([
      { enteredName: "COFFEE HOUSE", categoryId: GROCERIES, date: accountingDate("2026-08-02") },
    ]);
  });

  it("excludes deleted rows, uncategorised rows, and non income/expense rows", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          enteredName: "Deleted EnteredName",
          categoryId: GROCERIES,
          deletedAt: new Date("2026-08-01T11:00:00Z"),
        },
        {
          ...baseRow(1),
          date: accountingDate("2026-08-02"),
          enteredName: "Uncategorised EnteredName",
          categoryId: undefined,
        },
        {
          ...baseRow(2),
          type: "transfer",
          date: accountingDate("2026-08-03"),
          enteredName: "Transfer EnteredName",
          categoryId: GROCERIES,
        },
        {
          ...baseRow(3),
          date: accountingDate("2026-08-04"),
          enteredName: "Live EnteredName",
          categoryId: GROCERIES,
        },
      ])
      .run();

    const history = readEnteredNameHistory(db);

    expect(history.map((row) => row.enteredName)).toEqual(["Live EnteredName"]);
  });

  /**
   * H1a — the proposal source and the picker's own list have to agree.
   * `listCategories` drops archived rows, so a proposal naming one is a
   * category no chip can render and no sheet offers: the desk command bar
   * auto-filled it, displayed "Category?", and saved it on Enter.
   */
  it("skips a enteredName whose most recent category has been archived, and falls back to nothing", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          enteredName: "Gym",
          categoryId: RETIRED,
        },
      ])
      .run();
    archive(RETIRED);

    expect(readEnteredNameHistory(db)).toEqual([]);
  });

  /**
   * And it is the *category* that is skipped, not the entered name: an older row on
   * a live category is still that entered name's most recent live answer.
   */
  it("falls through to the newest row on a category that is still offered", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values([
        {
          ...baseRow(0),
          date: accountingDate("2026-08-01"),
          enteredName: "Gym",
          categoryId: GROCERIES,
        },
        {
          ...baseRow(1),
          date: accountingDate("2026-08-02"),
          enteredName: "Gym",
          categoryId: RETIRED,
        },
      ])
      .run();
    archive(RETIRED);

    expect(readEnteredNameHistory(db)).toEqual([
      { enteredName: "Gym", categoryId: GROCERIES, date: accountingDate("2026-08-01") },
    ]);
  });

  it("orders newest first across distinct enteredNames and respects the limit", () => {
    const db = stores.ledger.replica.db;
    db.insert(transactions)
      .values(
        Array.from({ length: 3 }, (_, index) => ({
          ...baseRow(index),
          date: accountingDate(`2026-08-0${index + 1}`),
          enteredName: `EnteredName ${index}`,
          categoryId: GROCERIES,
        })),
      )
      .run();

    const history = readEnteredNameHistory(db, 2);

    expect(history.map((row) => row.enteredName)).toEqual(["EnteredName 2", "EnteredName 1"]);
  });
});
