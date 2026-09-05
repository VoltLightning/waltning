/**
 * `get_transaction`, server side — mirrors `@waltning/ledger`'s
 * `readTransaction` field-for-field (`operations.md`, S09's whole subject).
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import {
  accounts,
  categories,
  currencies,
  transactionLines,
  transactions,
} from "@waltning/db/schema";
import { type Scratch, scratchDatabase } from "@waltning/db/test/scratch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTransactionById } from "./transactions.service.ts";

let s: Scratch;

const ACCOUNT = id<"accounts">("33333333-3333-3333-3333-000000000001");
const FOOD = id<"categories">("33333333-3333-3333-3333-000000000002");
const TXN = id<"transactions">("33333333-3333-3333-3333-000000000003");
const DELETED_TXN = id<"transactions">("33333333-3333-3333-3333-000000000004");
const LINE = id<"transactionLines">("33333333-3333-3333-3333-000000000005");

beforeAll(async () => {
  s = await scratchDatabase("get-transaction");
  const PLN = currencyCode("PLN");
  await s.db
    .insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true });
  await s.db.insert(accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN });
  await s.db.insert(categories).values({ id: FOOD, name: "Food", kind: "expense" });
  await s.db.insert(transactions).values([
    {
      id: TXN,
      date: accountingDate("2026-09-01"),
      type: "expense",
      accountId: ACCOUNT,
      categoryId: FOOD,
      amountOriginal: money.toMoney("48.90"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      payee: "Café A",
      note: "Meeting",
    },
    {
      id: DELETED_TXN,
      date: accountingDate("2026-09-01"),
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: money.toMoney("10"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      deletedAt: new Date(),
    },
  ]);
  await s.db.insert(transactionLines).values({
    id: LINE,
    transactionId: TXN,
    description: "Coffee",
    amount: money.toMoney("48.90"),
  });
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("getTransactionById", () => {
  it("joins the account, category and lines, signed negative for an expense", async () => {
    const row = await getTransactionById(s.db, TXN);

    expect(row).toMatchObject({
      id: TXN,
      payee: "Café A",
      accountName: "Bank A · PLN",
      categoryName: "Food",
      amount: "-48.90000000",
      currency: "PLN",
      decimals: 2,
    });
    expect(row?.lines).toEqual([
      expect.objectContaining({ id: LINE, description: "Coffee", amount: "48.90000000" }),
    ]);
  });

  it("returns null for a soft-deleted row — the same 'not there' as a missing one", async () => {
    expect(await getTransactionById(s.db, DELETED_TXN)).toBeNull();
  });

  it("returns null for an id that never existed", async () => {
    expect(await getTransactionById(s.db, id("00000000-0000-0000-0000-000000000000"))).toBeNull();
  });
});
