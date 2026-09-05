/**
 * Proves: computations.md §3 ("Receivables are excluded — lending is an
 * expense and repayment an unearned inflow (§6.6). Net worth is money you
 * hold.") and §3's `mine`/`ours` split (own vs. every account, per currency).
 */

import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readNetWorth } from "./read-net-worth.ts";

const { accounts, currencies } = ledgerSchema;

const USD = currencyCode("USD");

const WALLET = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SHARED = id<"accounts">("22222222-2222-4222-8222-222222222222");
const RECEIVABLE = id<"accounts">("33333333-3333-4333-8333-333333333333");
const PAYABLE = id<"accounts">("44444444-4444-4444-8444-444444444444");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values({ code: USD, name: "US dollar", symbol: "$", decimals: 2, isPivot: true })
    .run();
});

afterEach(() => stores.close());

describe("readNetWorth", () => {
  /**
   * H1 — the review found both engines summing every account regardless of
   * `kind`, so a `loan_receivable`'s balance counted as money held twice:
   * once as the ordinary account that lent it (an expense, already lower)
   * and again as the receivable's own opening balance. Break it once: delete
   * the `kind !== "loan_receivable"` filter in `readAccountsForNetWorth` and
   * this goes from `100` to `160`.
   */
  it("excludes a loan_receivable account from both mine and ours (§3)", () => {
    stores.ledger.replica.db
      .insert(accounts)
      .values([
        {
          id: WALLET,
          name: "Wallet · USD",
          currency: USD,
          kind: "cash",
          openingBalance: money.toMoney("100"),
        },
        {
          id: RECEIVABLE,
          name: "Loan to Nina",
          currency: USD,
          kind: "loan_receivable",
          openingBalance: money.toMoney("60"),
        },
      ])
      .run();

    const result = readNetWorth(stores.ledger.replica.db);

    expect(result).toEqual([
      { currency: USD, decimals: 2, mine: "100.00000000", ours: "100.00000000", hasShared: false },
    ]);
  });

  /** A `loan_payable` is a real liability, so it stays in — unlike a receivable, it is not excluded. */
  it("keeps a loan_payable account — a debt owed is a real liability", () => {
    stores.ledger.replica.db
      .insert(accounts)
      .values([
        {
          id: WALLET,
          name: "Wallet · USD",
          currency: USD,
          kind: "cash",
          openingBalance: money.toMoney("100"),
        },
        {
          id: PAYABLE,
          name: "Loan from Marek (my)",
          currency: USD,
          kind: "loan_payable",
          openingBalance: money.toMoney("-40"),
        },
      ])
      .run();

    const result = readNetWorth(stores.ledger.replica.db);

    expect(result).toEqual([
      { currency: USD, decimals: 2, mine: "60.00000000", ours: "60.00000000", hasShared: false },
    ]);
  });

  it("splits mine (own) from ours (own + shared), per currency", () => {
    stores.ledger.replica.db
      .insert(accounts)
      .values([
        {
          id: WALLET,
          name: "Wallet · USD",
          currency: USD,
          kind: "cash",
          ownership: "own",
          openingBalance: money.toMoney("100"),
        },
        {
          id: SHARED,
          name: "Household · USD",
          currency: USD,
          kind: "bank",
          ownership: "shared",
          openingBalance: money.toMoney("50"),
        },
      ])
      .run();

    const result = readNetWorth(stores.ledger.replica.db);

    expect(result).toEqual([
      { currency: USD, decimals: 2, mine: "100.00000000", ours: "150.00000000", hasShared: true },
    ]);
  });
});
