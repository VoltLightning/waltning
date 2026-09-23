/**
 * `allocate_shares`, as the phone applies it — J08 §3's ALLOCATE step.
 *
 * Same harness as `counterparty-ops.test.ts`: real two-file writes through
 * `writeLocally` and the real `ledgerRegistry`, so a refusal here is a
 * refusal a caller of `writeLocally` actually meets.
 *
 * The pot is funded the way J08 funds it — a transfer into a clearing
 * account — rather than by an opening balance, because the opening balance is
 * the one path that would let every one of these pass while the fold over
 * transaction legs was wrong.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateSharesExecutor } from "../counterparties/allocate-shares.executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { Capture } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, counterparties, transactions } = schema;

const PLN = currencyCode("PLN");
const BANK = id<"accounts">("11111111-1111-4111-8111-111111111111");
const POT = id<"accounts">("11111111-1111-4111-8111-111111111112");
const NINA = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const MAREK = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const FOOD = id<"categories">("44444444-4444-4444-8444-444444444444");
const DATE = accountingDate("2026-09-23");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

/** A distinct id per share, so nothing collides and nothing is reused. */
const share = (n: number) => id<"transactions">(`55555555-5555-4555-8555-55555555555${n}`);

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: BANK, name: "Bank A · PLN", currency: PLN, kind: "bank" },
      { id: POT, name: "Clearing · PLN", currency: PLN, kind: "clearing" },
    ])
    .run();
  db.insert(schema.categories).values({ id: FOOD, name: "Eating out", kind: "expense" }).run();
  db.insert(counterparties)
    .values([
      { id: NINA, name: "Nina", nameFolded: "nina" },
      { id: MAREK, name: "Marek", nameFolded: "marek" },
    ])
    .run();
});

afterEach(() => s?.close());

/** J08 §3's first step: the money you laid out, transferred into the pot. */
function fund(amount: string) {
  s.ledger.replica.db
    .insert(transactions)
    .values({
      id: id<"transactions">("66666666-6666-4666-8666-666666666666"),
      date: DATE,
      type: "transfer",
      accountId: BANK,
      toAccountId: POT,
      amountOriginal: money.toMoney(amount),
      toAmount: money.toMoney(amount),
      currency: PLN,
      toCurrency: PLN,
      fxRate: money.pivotPerUnit("1"),
    })
    .run();
}

function allocate(input: unknown) {
  return writeLocally(s.ledger, {
    executor: allocateSharesExecutor,
    registry: ledgerRegistry,
    input,
    capture,
  });
}

const base = (shares: readonly unknown[]) => ({
  accountId: POT,
  date: DATE,
  currency: PLN,
  categoryId: FOOD,
  shares,
});

const balanceOf = (accountId: Id<"accounts">) => {
  const rows = s.ledger.replica.db
    .select({
      type: transactions.type,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      amountOriginal: transactions.amountOriginal,
      toAmount: transactions.toAmount,
    })
    .from(transactions)
    .all();
  return money.accountBalance(money.ZERO, accountId, rows);
};

describe("allocate_shares — the split lands", () => {
  it("writes one row per share and takes the pot to zero (J08 §3, §6.4)", () => {
    fund("400.00");

    const result = allocate(
      base([
        { id: share(1), counterpartyId: null, amount: "100.00" },
        { id: share(2), counterpartyId: NINA, amount: "100.00" },
        { id: share(3), counterpartyId: MAREK, amount: "200.00" },
      ]),
    );

    expect(result.row.rows).toHaveLength(3);
    expect(money.round(result.row.remaining, 2)).toBe("0.00");
    expect(money.round(balanceOf(POT), 2)).toBe("0.00");
  });

  it("marks a counterparty's share as debt and your own as neither (J08 §4, §6.6)", () => {
    fund("300.00");
    allocate(
      base([
        { id: share(1), counterpartyId: null, amount: "100.00" },
        { id: share(2), counterpartyId: NINA, amount: "200.00" },
      ]),
    );

    const rows = s.ledger.replica.db.select().from(transactions).all();
    const mine = rows.find((row) => row.id === share(1));
    const hers = rows.find((row) => row.id === share(2));

    expect(mine?.counterpartyId).toBeNull();
    expect(mine?.counterpartyRole).toBeNull();
    expect(mine?.categoryId).toBe(FOOD);
    // §6.6 — the role is what puts it in the debt ledger at all.
    expect(hers?.counterpartyId).toBe(NINA);
    expect(hers?.counterpartyRole).toBe("debt");
    // Every row is an expense out of the pot, never a transfer back into it.
    expect(rows.filter((row) => row.accountId === POT).every((row) => row.type === "expense")).toBe(
      true,
    );
  });

  it("names each share after the person it belongs to (`settle_debt`'s own stamp)", () => {
    fund("300.00");
    allocate(
      base([
        { id: share(1), counterpartyId: null, amount: "100.00" },
        { id: share(2), counterpartyId: NINA, amount: "200.00" },
      ]),
    );

    const rows = s.ledger.replica.db.select().from(transactions).all();
    // Without it the ledger holds rows reading `—`, and the list you scroll
    // is where you would go looking for whose share it was.
    expect(rows.find((row) => row.id === share(2))?.payee).toBe("Nina");
    // Yours is nobody's, so it carries no name — the category says what it was.
    expect(rows.find((row) => row.id === share(1))?.payee).toBe("");
  });

  it("leaves the remainder on the pot when the split does not sum (J08 §4)", () => {
    fund("400.00");

    const result = allocate(
      base([
        { id: share(1), counterpartyId: null, amount: "100.00" },
        { id: share(2), counterpartyId: NINA, amount: "100.00" },
      ]),
    );

    // Committed, not refused: §4 allows it, and the banner is what says so.
    expect(result.row.rows).toHaveLength(2);
    expect(money.round(result.row.remaining, 2)).toBe("200.00");
  });

  it("queues one outbox entry, minting every row's id (executor.ts)", () => {
    fund("200.00");
    allocate(
      base([
        { id: share(1), counterpartyId: NINA, amount: "100.00" },
        { id: share(2), counterpartyId: MAREK, amount: "100.00" },
      ]),
    );

    const entries = s.ledger.outbox.db.select().from(schema.outbox).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.operation).toBe("allocate_shares");
    expect(
      allocateSharesExecutor.mints(
        allocateSharesExecutor.input.parse(
          base([
            { id: share(1), counterpartyId: NINA, amount: "100.00" },
            { id: share(2), counterpartyId: MAREK, amount: "100.00" },
          ]),
        ),
      ),
    ).toEqual([share(1), share(2)]);
  });
});

describe("allocate_shares — what it refuses", () => {
  it("refuses an account that is not a clearing account (§6.4)", () => {
    // The pot must be money already set aside. Run against the account you
    // paid from, this would take the bill out of it a second time.
    expect(() =>
      allocate({
        ...base([{ id: share(1), counterpartyId: NINA, amount: "10.00" }]),
        accountId: BANK,
      }),
    ).toThrow(/clearing account/);
  });

  it("refuses more than the pot holds (§6.4)", () => {
    fund("300.00");

    expect(() =>
      allocate(
        base([
          { id: share(1), counterpartyId: NINA, amount: "200.00" },
          { id: share(2), counterpartyId: MAREK, amount: "200.00" },
        ]),
      ),
    ).toThrow(/does not hold/);
  });

  it("does not count a transfer that funds the pot after the allocation's date", () => {
    fund("400.00");
    s.ledger.replica.db
      .update(transactions)
      .set({ date: accountingDate("2026-09-30") })
      .where(eq(transactions.id, id<"transactions">("66666666-6666-4666-8666-666666666666")))
      .run();

    // `reconcile_account`'s own cutoff, for the same reason: money arriving
    // next week is not money this allocation may hand out today.
    expect(() =>
      allocate(base([{ id: share(1), counterpartyId: NINA, amount: "100.00" }])),
    ).toThrow(/does not hold/);
  });

  it("refuses a currency the account does not hold (§6.5)", () => {
    fund("200.00");
    expect(() =>
      allocate({
        ...base([{ id: share(1), counterpartyId: NINA, amount: "100.00" }]),
        currency: currencyCode("EUR"),
      }),
    ).toThrow(/does not match account currency/);
  });

  it("refuses a share naming a counterparty that does not exist", () => {
    fund("200.00");
    expect(() =>
      allocate(
        base([
          {
            id: share(1),
            counterpartyId: id<"counterparties">("99999999-9999-4999-8999-999999999999"),
            amount: "100.00",
          },
        ]),
      ),
    ).toThrow(/no counterparty/);
  });

  it("refuses two shares for one person, which would fold into one invisible debt", () => {
    fund("400.00");
    expect(() =>
      allocate(
        base([
          { id: share(1), counterpartyId: NINA, amount: "100.00" },
          { id: share(2), counterpartyId: NINA, amount: "100.00" },
        ]),
      ),
    ).toThrow(/one share in an allocation/);
  });

  it("refuses two shares that are both yours", () => {
    fund("400.00");
    expect(() =>
      allocate(
        base([
          { id: share(1), counterpartyId: null, amount: "100.00" },
          { id: share(2), counterpartyId: null, amount: "100.00" },
        ]),
      ),
    ).toThrow(/one share is yours, not two/);
  });

  it("refuses a share of nothing", () => {
    fund("400.00");
    expect(() => allocate(base([{ id: share(1), counterpartyId: NINA, amount: "0.00" }]))).toThrow(
      /a share is positive/,
    );
  });

  it("refuses a figure past the currency's own scale, before the entry commits", () => {
    fund("400.00");
    expect(() =>
      allocate(base([{ id: share(1), counterpartyId: NINA, amount: "100.001" }])),
    ).toThrow(/decimal places/);
    // Pre-outbox: nothing queued for a write nothing would ever apply.
    expect(s.ledger.outbox.db.select().from(schema.outbox).all()).toHaveLength(0);
  });
});
