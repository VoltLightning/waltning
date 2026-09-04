/**
 * `readCategoryUsage` — S19's usage count, and `computations.md` §6's trap
 * restated for a count rather than a sum.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCategoryUsage } from "../categories/read-category-usage.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, categories, recurringTransactions, transactionLines, transactions } = schema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const GROCERIES = id<"categories">("33333333-3333-4333-8333-333333333333");
const EATING_OUT = id<"categories">("44444444-4444-4444-8444-444444444444");
const TAKEOUT = id<"categories">("99999999-9999-4999-8999-999999999999");

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN }).run();
  db.insert(categories)
    .values([
      { id: GROCERIES, name: "Groceries", kind: "expense", isLeaf: true },
      { id: EATING_OUT, name: "Eating out", kind: "expense", isLeaf: true },
      { id: TAKEOUT, name: "Takeout", kind: "expense", isLeaf: true },
    ])
    .run();
});

afterEach(() => s?.close());

function transaction(overrides: {
  id: ReturnType<typeof id<"transactions">>;
  categoryId?: ReturnType<typeof id<"categories">> | null;
  deletedAt?: Date;
}) {
  return {
    date: accountingDate("2026-03-12"),
    type: "expense" as const,
    accountId: ACCOUNT,
    amountOriginal: money.toMoney("18.40"),
    currency: PLN,
    fxRate: money.pivotPerUnit("1"),
    ...overrides,
  };
}

describe("readCategoryUsage", () => {
  it("counts a plain transaction once against its own category", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values(
        transaction({ id: id("aaaaaaaa-0000-4000-8000-000000000001"), categoryId: GROCERIES }),
      )
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    expect(usage.get(GROCERIES)).toBe(1);
    expect(usage.get(EATING_OUT)).toBeUndefined();
  });

  it("a four-line transaction counts once per category it touches, not once per line", () => {
    const txnId = id<"transactions">("aaaaaaaa-0000-4000-8000-000000000002");
    s.ledger.replica.db
      .insert(transactions)
      .values(transaction({ id: txnId, categoryId: null }))
      .run();
    s.ledger.replica.db
      .insert(transactionLines)
      .values([
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000001"),
          transactionId: txnId,
          description: "Bread",
          amount: money.toMoney("4.00"),
          categoryId: GROCERIES,
        },
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000002"),
          transactionId: txnId,
          description: "Milk",
          amount: money.toMoney("4.00"),
          categoryId: GROCERIES,
        },
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000003"),
          transactionId: txnId,
          description: "Cheese",
          amount: money.toMoney("4.00"),
          categoryId: GROCERIES,
        },
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000004"),
          transactionId: txnId,
          description: "Coffee",
          amount: money.toMoney("6.40"),
          categoryId: EATING_OUT,
        },
      ])
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    // Three lines in Groceries collapse to one touch; the one Eating out line
    // is a second, distinct touch on the same transaction.
    expect(usage.get(GROCERIES)).toBe(1);
    expect(usage.get(EATING_OUT)).toBe(1);
    expect(usage.get(TAKEOUT)).toBeUndefined();
  });

  it("lines win where they exist — a transaction's own category is ignored once it has lines", () => {
    const txnId = id<"transactions">("aaaaaaaa-0000-4000-8000-000000000003");
    // The transaction's own category is a leftover from before it was split —
    // §6's rule for spend applies identically to a count.
    s.ledger.replica.db
      .insert(transactions)
      .values(transaction({ id: txnId, categoryId: TAKEOUT }))
      .run();
    s.ledger.replica.db
      .insert(transactionLines)
      .values({
        id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000005"),
        transactionId: txnId,
        description: "Bread",
        amount: money.toMoney("18.40"),
        categoryId: GROCERIES,
      })
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    expect(usage.get(GROCERIES)).toBe(1);
    expect(usage.get(TAKEOUT)).toBeUndefined();
  });

  it("excludes a soft-deleted transaction", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values(
        transaction({
          id: id("aaaaaaaa-0000-4000-8000-000000000004"),
          categoryId: GROCERIES,
          deletedAt: new Date(),
        }),
      )
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    expect(usage.get(GROCERIES)).toBeUndefined();
  });

  it("counts a recurring rule with no occurrence posted yet", () => {
    s.ledger.replica.db
      .insert(recurringTransactions)
      .values({
        id: id("cccccccc-0000-4000-8000-000000000001"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("9.99"),
        currency: PLN,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    expect(usage.get(EATING_OUT)).toBe(1);
  });

  it("adds a transaction touch and a recurring touch on the same category separately", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values(
        transaction({ id: id("aaaaaaaa-0000-4000-8000-000000000005"), categoryId: EATING_OUT }),
      )
      .run();
    s.ledger.replica.db
      .insert(recurringTransactions)
      .values({
        id: id("cccccccc-0000-4000-8000-000000000002"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("9.99"),
        currency: PLN,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    const usage = readCategoryUsage(s.ledger.replica.db);

    expect(usage.get(EATING_OUT)).toBe(2);
  });

  it("returns an empty map over an unused taxonomy", () => {
    const usage = readCategoryUsage(s.ledger.replica.db);
    expect(usage.size).toBe(0);
  });
});
