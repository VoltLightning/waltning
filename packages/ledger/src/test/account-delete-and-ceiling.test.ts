/**
 * `delete_account` (§6.9: delete what nothing references, archive the rest) and
 * the amount ceiling (`999 999 999.99`), on the replica.
 *
 * Each guarantee is tested at the layer that states it **and again under it**,
 * with the layer above bypassed: a raw `DELETE` or `INSERT` is what the trigger
 * is for, and a test that only went through the executor would pass with the
 * trigger missing. Both triggers were broken once by hand — dropped from the
 * hook, the raw-write tests below went red — before this file was committed.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { deleteAccountExecutor } from "../accounts/delete-account.executor.ts";
import { readAccounts } from "../accounts/read-accounts.ts";
import { updateAccountExecutor } from "../accounts/update-account.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { assertAmountCeiling, assertMoneyScale } from "../scale.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, outbox, transactions } = schema;

const PLN = currencyCode("PLN");
const EMPTY = id<"accounts">("11111111-1111-4111-8111-111111111111");
const USED = id<"accounts">("22222222-2222-4222-8222-222222222222");
const FUNDED = id<"accounts">("33333333-3333-4333-8333-333333333333");
const TXN = id<"transactions">("44444444-4444-4444-8444-444444444444");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([
      { id: EMPTY, name: "Cash · PLN", currency: PLN },
      { id: USED, name: "Bank A · PLN", currency: PLN },
      { id: FUNDED, name: "Bank B · PLN", currency: PLN, openingBalance: money.toMoney("10.00") },
    ])
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const version = (accountId: typeof EMPTY) =>
  s.ledger.replica.db.select().from(accounts).where(eq(accounts.id, accountId)).all()[0]?.version;
const exists = (accountId: typeof EMPTY) => version(accountId) !== undefined;

function insertTransaction(amount: string, options: { deleted?: boolean } = {}): void {
  s.ledger.replica.db
    .insert(transactions)
    .values({
      id: TXN,
      date: accountingDate("2026-03-01"),
      type: "income",
      accountId: USED,
      amountOriginal: money.toMoney(amount),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      ...(options.deleted ? { deletedAt: new Date() } : {}),
    })
    .run();
}

describe("delete_account", () => {
  it("removes an account nothing references, and queues one entry", () => {
    const result = write(deleteAccountExecutor, { id: EMPTY, version: version(EMPTY) });

    expect(result.row.id).toBe(EMPTY);
    expect(exists(EMPTY)).toBe(false);
    expect(s.ledger.outbox.db.select().from(outbox).all()).toHaveLength(1);
  });

  it("refuses an account a transaction names, and says to archive it", () => {
    insertTransaction("12.00");

    expect(() => write(deleteAccountExecutor, { id: USED, version: version(USED) })).toThrow(
      /has entries \(transactions\) — archive it instead/,
    );
    expect(exists(USED)).toBe(true);
  });

  it("refuses an account whose only entry is soft-deleted — the row still names it", () => {
    insertTransaction("12.00", { deleted: true });

    expect(() => write(deleteAccountExecutor, { id: USED, version: version(USED) })).toThrow(
      /has entries/,
    );
  });

  it("refuses an account holding an opening balance", () => {
    expect(() => write(deleteAccountExecutor, { id: FUNDED, version: version(FUNDED) })).toThrow(
      /has entries \(opening_balance\)/,
    );
  });

  it("refuses a stale version — the row moved under the writer", () => {
    expect(() => write(deleteAccountExecutor, { id: EMPTY, version: 999 })).toThrow(
      /stale version/,
    );
    expect(exists(EMPTY)).toBe(true);
  });

  it("refuses an account that is not there, as a dependency", () => {
    const ghost = id<"accounts">("99999999-9999-4999-8999-999999999999");
    expect(() => write(deleteAccountExecutor, { id: ghost, version: 1 })).toThrow(/no account/);
  });

  it("is what readAccounts reports as hasEntries, so the editor offers Delete only where it works", () => {
    insertTransaction("12.00");
    const byId = new Map(readAccounts(s.ledger.replica.db).map((a) => [a.id, a.hasEntries]));

    expect(byId.get(EMPTY)).toBe(false);
    expect(byId.get(USED)).toBe(true);
    expect(byId.get(FUNDED)).toBe(true);
  });

  describe("accounts_delete_guard — the trigger under the executor", () => {
    // A raw DELETE is what the guard exists for: the executor is bypassed, and
    // foreign keys are switched off so the trigger is the only thing that can
    // refuse (with them on, the FK refuses transactions first and the trigger
    // is never the one that fires).
    beforeEach(() => {
      s.ledger.replica.db.run(sql.raw("pragma foreign_keys = OFF"));
    });

    it("refuses a raw delete of an account a transaction names", () => {
      insertTransaction("12.00");
      expect(() => s.ledger.replica.db.delete(accounts).where(eq(accounts.id, USED)).run()).toThrow(
        /WA023/,
      );
      expect(exists(USED)).toBe(true);
    });

    it("refuses a raw delete of an account with an opening balance", () => {
      expect(() =>
        s.ledger.replica.db.delete(accounts).where(eq(accounts.id, FUNDED)).run(),
      ).toThrow(/WA023/);
    });

    it("lets a raw delete of an unreferenced account through", () => {
      s.ledger.replica.db.delete(accounts).where(eq(accounts.id, EMPTY)).run();
      expect(exists(EMPTY)).toBe(false);
    });
  });
});

describe("the amount ceiling", () => {
  it("accepts 999 999 999.99 at the executor's check and refuses 1 000 000 000.00", () => {
    expect(() =>
      assertAmountCeiling("999999999.99", "create_transaction: amount_original"),
    ).not.toThrow();
    expect(() =>
      assertAmountCeiling("-999999999.99", "create_transaction: amount_original"),
    ).not.toThrow();
    expect(() =>
      assertAmountCeiling("1000000000.00", "create_transaction: amount_original"),
    ).toThrow(/past the largest amount/);
    expect(() => assertAmountCeiling("-1000000000", "create_transaction: amount_original")).toThrow(
      /past the largest amount/,
    );
  });

  it("names the column, so a screen can route it to the field", () => {
    try {
      assertAmountCeiling("1000000000.00", "create_transaction: to_amount");
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ column: "to_amount", params: { max: "999999999.99" } });
    }
  });

  it("rides on the scale check every figure already passes through", () => {
    s.ledger.replica.db.transaction((tx) => {
      expect(() =>
        assertMoneyScale(tx, "1000000000.00", PLN, "create_account: opening_balance"),
      ).toThrow(/past the largest amount/);
      expect(() =>
        assertMoneyScale(tx, "999999999.99", PLN, "create_account: opening_balance"),
      ).not.toThrow();
    });
  });

  it("refuses an oversized patch through update_account's executor", () => {
    expect(() =>
      write(updateAccountExecutor, {
        id: EMPTY,
        version: version(EMPTY),
        patch: { openingBalance: "1000000000.00" },
      }),
    ).toThrow();
    expect(
      write(updateAccountExecutor, {
        id: EMPTY,
        version: version(EMPTY),
        patch: { openingBalance: "999999999.99" },
      }).row.openingBalance,
    ).toBe("999999999.99000000");
  });

  describe("*_amount_ceiling_* — the triggers under the executor", () => {
    it("takes 999 999 999.99 and refuses 1 000 000 000.00 on a raw transaction insert", () => {
      insertTransaction("999999999.99");
      s.ledger.replica.db.delete(transactions).where(eq(transactions.id, TXN)).run();
      expect(() => insertTransaction("1000000000.00")).toThrow(/_amount_ceiling/);
    });

    it("does not round a figure in bounds up to the ceiling", () => {
      // `CAST(… AS REAL)` would read this as exactly 1e9 and refuse it.
      expect(() => insertTransaction("999999999.99999999")).not.toThrow();
    });

    it("refuses a raw update past the ceiling, on the amount and on the destination leg", () => {
      insertTransaction("12.00");
      expect(() =>
        s.ledger.replica.db
          .update(transactions)
          .set({ amountOriginal: money.toMoney("1000000000.00") })
          .where(eq(transactions.id, TXN))
          .run(),
      ).toThrow(/_amount_ceiling/);
      expect(() =>
        s.ledger.replica.db
          .update(transactions)
          .set({ toAmount: money.toMoney("1000000000.00") })
          .where(eq(transactions.id, TXN))
          .run(),
      ).toThrow(/_amount_ceiling/);
    });

    it("refuses an opening balance past the ceiling on a raw insert and update", () => {
      expect(() =>
        s.ledger.replica.db
          .insert(accounts)
          .values({
            id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
            name: "Bank C · PLN",
            currency: PLN,
            openingBalance: money.toMoney("-1000000000.00"),
          })
          .run(),
      ).toThrow(/_amount_ceiling/);
      expect(() =>
        s.ledger.replica.db
          .update(accounts)
          .set({ openingBalance: money.toMoney("1000000000.00") })
          .where(eq(accounts.id, EMPTY))
          .run(),
      ).toThrow(/_amount_ceiling/);
    });
  });
});
