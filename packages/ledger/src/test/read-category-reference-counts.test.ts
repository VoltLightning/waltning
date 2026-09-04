/**
 * `readCategoryReferenceCounts` — S19's merge preview, split by table. It
 * must match `merge_categories`'s own three updates exactly, so this test
 * inserts fixtures the same way `category-ops.test.ts`'s merge tests do and
 * checks the pre-write count against the post-write `movedX` figures there.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCategoryReferenceCounts } from "../categories/read-category-reference-counts.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, categories, recurringTransactions, transactionLines, transactions } = schema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const EATING_OUT = id<"categories">("44444444-4444-4444-8444-444444444444");

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN }).run();
  db.insert(categories).values({ id: EATING_OUT, name: "Eating out", kind: "expense" }).run();
});

afterEach(() => s?.close());

describe("readCategoryReferenceCounts", () => {
  it("counts every raw row across all three tables, undeduplicated", () => {
    const txnA = id<"transactions">("aaaaaaaa-0000-4000-8000-000000000001");
    const txnB = id<"transactions">("aaaaaaaa-0000-4000-8000-000000000002");
    s.ledger.replica.db
      .insert(transactions)
      .values([
        {
          id: txnA,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ACCOUNT,
          categoryId: EATING_OUT,
          amountOriginal: money.toMoney("18.40"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: txnB,
          date: accountingDate("2026-03-13"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("60.00"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();
    // Two lines on the same transaction, both naming the category — a raw
    // count of 2, unlike `readCategoryUsage`'s deduplicated 1.
    s.ledger.replica.db
      .insert(transactionLines)
      .values([
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000001"),
          transactionId: txnB,
          description: "Coffee",
          amount: money.toMoney("30.00"),
          categoryId: EATING_OUT,
        },
        {
          id: id<"transactionLines">("bbbbbbbb-0000-4000-8000-000000000002"),
          transactionId: txnB,
          description: "Snacks",
          amount: money.toMoney("30.00"),
          categoryId: EATING_OUT,
        },
      ])
      .run();
    s.ledger.replica.db
      .insert(recurringTransactions)
      .values({
        id: id<"recurringTransactions">("cccccccc-0000-4000-8000-000000000001"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("9.99"),
        currency: PLN,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    const counts = readCategoryReferenceCounts(s.ledger.replica.db, EATING_OUT);

    expect(counts).toEqual({ transactions: 1, lines: 2, rules: 1 });
  });

  it("returns zero across the board for an unreferenced category", () => {
    const counts = readCategoryReferenceCounts(s.ledger.replica.db, EATING_OUT);
    expect(counts).toEqual({ transactions: 0, lines: 0, rules: 0 });
  });
});
