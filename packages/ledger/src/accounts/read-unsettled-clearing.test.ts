import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readUnsettledClearing } from "./read-unsettled-clearing.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const UNSETTLED = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SETTLED = id<"accounts">("22222222-2222-4222-8222-222222222222");
const BANK = id<"accounts">("33333333-3333-4333-8333-333333333333");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: UNSETTLED, name: "Shared clearing", currency: PLN, kind: "clearing" },
      { id: SETTLED, name: "Settled clearing", currency: PLN, kind: "clearing" },
      { id: BANK, name: "Bank A · PLN", currency: PLN, kind: "bank" },
    ])
    .run();
  db.insert(transactions)
    .values([
      {
        id: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        date: accountingDate("2026-08-05"),
        type: "income",
        accountId: UNSETTLED,
        amountOriginal: money.toMoney("340"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      },
    ])
    .run();
});

afterEach(() => stores.close());

describe("readUnsettledClearing", () => {
  it("names only the clearing account with a non-zero balance, and its one open inflow", () => {
    expect(readUnsettledClearing(stores.ledger.replica.db)).toEqual([
      {
        accountId: UNSETTLED,
        name: "Shared clearing",
        currency: PLN,
        decimals: 2,
        balance: "340.00000000",
        oldestUnconsumedTransactionId: id<"transactions">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        oldestDate: accountingDate("2026-08-05"),
        oldestUnconsumedRemainder: "340.00000000",
        oldestUnconsumedPayee: "",
      },
    ]);
  });

  it("never a bank account, even one holding a balance", () => {
    const result = readUnsettledClearing(stores.ledger.replica.db);
    expect(result.some((row) => row.accountId === BANK)).toBe(false);
  });

  it("a clearing account netted to zero does not appear", () => {
    expect(
      readUnsettledClearing(stores.ledger.replica.db).some((row) => row.accountId === SETTLED),
    ).toBe(false);
  });

  /**
   * §8's own reading: inflows open, outflows consume, FIFO. Two inflows to
   * the clearing account, one allocation out that exhausts the older —
   * J08's group bill shape (`computations.md` §8).
   */
  it("names the oldest still-open inflow once an older one is fully allocated", () => {
    const db = stores.ledger.replica.db;
    db.insert(accounts)
      .values({
        id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
        name: "Trip clearing",
        currency: PLN,
        kind: "clearing",
      })
      .run();
    const trip = id<"accounts">("44444444-4444-4444-8444-444444444444");
    db.insert(transactions)
      .values([
        {
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-08-01"),
          type: "income",
          accountId: trip,
          payee: "Hotel",
          amountOriginal: money.toMoney("120"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-08-05"),
          type: "income",
          accountId: trip,
          payee: "Dinner",
          amountOriginal: money.toMoney("80"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
          date: accountingDate("2026-08-06"),
          type: "expense",
          accountId: trip,
          payee: "Allocated to Nina",
          amountOriginal: money.toMoney("120"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();

    const row = readUnsettledClearing(db).find((candidate) => candidate.accountId === trip);
    expect(row).toEqual({
      accountId: trip,
      name: "Trip clearing",
      currency: PLN,
      decimals: 2,
      balance: "80.00000000",
      oldestUnconsumedTransactionId: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      oldestDate: accountingDate("2026-08-05"),
      oldestUnconsumedRemainder: "80.00000000",
      oldestUnconsumedPayee: "Dinner",
    });
  });

  /**
   * H2 — the opening balance is seeded as its own FIFO entry, `id: null`,
   * dated `openingDate`. Opening 100, one 40 expense: balance 60, and the
   * opening entry — never named — is what is still open, not the expense
   * (a consuming row).
   */
  it("names the opening balance itself (id null) when it is the oldest still-open entry", () => {
    const db = stores.ledger.replica.db;
    const opened = id<"accounts">("55555555-5555-4555-8555-555555555555");
    db.insert(accounts)
      .values({
        id: opened,
        name: "Opened clearing",
        currency: PLN,
        kind: "clearing",
        openingBalance: money.toMoney("100"),
        openingDate: accountingDate("2026-08-01"),
      })
      .run();
    db.insert(transactions)
      .values({
        id: id<"transactions">("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        date: accountingDate("2026-08-10"),
        type: "expense",
        accountId: opened,
        amountOriginal: money.toMoney("40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    const row = readUnsettledClearing(db).find((candidate) => candidate.accountId === opened);
    expect(row).toEqual({
      accountId: opened,
      name: "Opened clearing",
      currency: PLN,
      decimals: 2,
      balance: "60.00000000",
      oldestUnconsumedTransactionId: null,
      oldestDate: accountingDate("2026-08-01"),
      oldestUnconsumedRemainder: "60.00000000",
      oldestUnconsumedPayee: null,
    });
  });

  /**
   * H3 — two open inflows with nothing consuming either: the oldest entry's
   * own remainder (120) is less than the account's whole balance (200), so a
   * banner reading the balance beside that entry's payee would overstate
   * what it is actually naming.
   */
  it("names a remainder smaller than the account balance when more than one entry is open", () => {
    const db = stores.ledger.replica.db;
    const twoOpen = id<"accounts">("66666666-6666-4666-8666-666666666666");
    db.insert(accounts)
      .values({ id: twoOpen, name: "Two open", currency: PLN, kind: "clearing" })
      .run();
    db.insert(transactions)
      .values([
        {
          id: id<"transactions">("ffffffff-ffff-4fff-8fff-ffffffffffff"),
          date: accountingDate("2026-08-01"),
          type: "income",
          accountId: twoOpen,
          payee: "First",
          amountOriginal: money.toMoney("120"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("11111111-2222-4333-8444-555555555555"),
          date: accountingDate("2026-08-05"),
          type: "income",
          accountId: twoOpen,
          payee: "Second",
          amountOriginal: money.toMoney("80"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();

    const row = readUnsettledClearing(db).find((candidate) => candidate.accountId === twoOpen);
    expect(row?.balance).toBe("200.00000000");
    expect(row?.oldestUnconsumedRemainder).toBe("120.00000000");
    expect(row?.oldestUnconsumedPayee).toBe("First");
  });

  /**
   * M1 — an archived clearing account still carrying a non-zero balance is
   * still a prompt (§6.4), the same rule `read-counterparty-balances.ts`
   * already applies to an archived counterparty.
   */
  it("includes an archived clearing account when its balance is non-zero", () => {
    const db = stores.ledger.replica.db;
    const archived = id<"accounts">("77777777-7777-4777-8777-777777777777");
    db.insert(accounts)
      .values({ id: archived, name: "Old trip", currency: PLN, kind: "clearing", archived: true })
      .run();
    db.insert(transactions)
      .values({
        id: id<"transactions">("88888888-8888-4888-8888-888888888888"),
        date: accountingDate("2026-08-01"),
        type: "income",
        accountId: archived,
        amountOriginal: money.toMoney("50"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    expect(readUnsettledClearing(db).some((row) => row.accountId === archived)).toBe(true);
  });
});
