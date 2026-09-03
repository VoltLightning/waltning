/**
 * The transaction operations beyond create, on two real files. Each op:
 * lands the row and its outbox entry; refuses what operations.md says it
 * must; and a crash between the two stores leaves neither the update nor its
 * mark on the row — the property write.test.ts proves for create, restated
 * per op because a new executor is a new chance to break it.
 */

import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { defineLocalExecutor, localRegistry } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import { type Capture, type LocalTx, writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { currencies, outbox, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");
const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 120 };
const ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const TXN = id<"transactions">("00000000-0000-4000-8000-000000000001");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true })
    .run();
  writeLocally(stores.ledger, {
    executor: createAccountExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: ACCOUNT, name: "Bank A · PLN", currency: PLN },
  });
  writeLocally(stores.ledger, {
    executor: createTransactionExecutor,
    registry: ledgerRegistry,
    capture,
    input: {
      id: TXN,
      date: "2026-09-01",
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: "18",
      currency: PLN,
      payee: "Coffee",
    },
  });
});
afterEach(() => stores.close());

const readTxn = () =>
  stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, TXN)).get();

describe("update_transaction", () => {
  it("patches only the fields sent, bumps version and updated_at, and queues one entry", () => {
    const before = readTxn();
    // SQLite's timestamp column is second-resolution, and this test otherwise
    // runs both stamps within the same tick — advance the clock so a changed
    // `updated_at` is a real assertion rather than a coin flip on timing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date((before?.updatedAt?.getTime() ?? Date.now()) + 2000));
    const result = writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { payee: "Coffee at the station" } },
    });
    vi.useRealTimers();
    const after = readTxn();

    expect(after?.payee).toBe("Coffee at the station");
    expect(after?.amountOriginal).toBe(before?.amountOriginal);
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.updatedAt).not.toEqual(before?.updatedAt);

    const entries = stores.ledger.outbox.db.select().from(outbox).all();
    expect(entries.map((e) => e.operation)).toEqual([
      "create_account",
      "create_transaction",
      "update_transaction",
    ]);
    expect(result.deps).toContain(entries[1]?.id);
  });

  it("refuses a stale version — the row moved under the writer", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: { id: TXN, version: 999, patch: { payee: "x" } },
      }),
    ).toThrow(/stale/);
    expect(readTxn()?.payee).toBe("Coffee");
  });

  it("refuses to patch a deleted row", () => {
    writeLocally(stores.ledger, {
      executor: deleteTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: readTxn()?.version ?? 0 },
    });
    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: { id: TXN, version: readTxn()?.version ?? 0, patch: { payee: "x" } },
      }),
    ).toThrow(/deleted/);
  });
});

describe("delete_transaction", () => {
  it("is soft: sets deleted_at, keeps the row, and refuses a second delete", () => {
    writeLocally(stores.ledger, {
      executor: deleteTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: readTxn()?.version ?? 0 },
    });
    const row = readTxn();

    expect(row).toBeDefined();
    expect(row?.deletedAt).not.toBeNull();

    expect(() =>
      writeLocally(stores.ledger, {
        executor: deleteTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: { id: TXN, version: row?.version ?? 0 },
      }),
    ).toThrow(/already deleted/);
  });

  it("refuses a stale version", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: deleteTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: { id: TXN, version: 999 },
      }),
    ).toThrow(/stale/);
    expect(readTxn()?.deletedAt).toBeNull();
  });
});

describe("a crash between the two stores", () => {
  it("leaves the outbox entry pending and the row unpatched — write.test.ts's technique, per op", () => {
    // Mirrors write.test.ts's `refuses` executor: same operation name and
    // input, an `apply` that always throws, standing in for a replica commit
    // that fails after the outbox commit already landed.
    type Tx = LocalTx<unknown, typeof ledgerSchema>;
    const failingUpdate = defineLocalExecutor<typeof updateTransactionExecutor.input, never, Tx>({
      operation: "update_transaction",
      opVersion: 1,
      input: updateTransactionExecutor.input,
      mints: () => [],
      apply: () => {
        throw new Error("the replica half failed");
      },
    });
    const registry = localRegistry([failingUpdate]);
    const before = readTxn();

    expect(() =>
      writeLocally(stores.ledger, {
        executor: failingUpdate,
        registry,
        capture,
        input: { id: TXN, version: before?.version ?? 0, patch: { payee: "Crashed" } },
      }),
    ).toThrow("the replica half failed");

    // The window this design leaves open: an entry whose row is missing its
    // effect, never a row edited with no entry behind it.
    const entries = stores.ledger.outbox.db.select().from(outbox).all();
    expect(entries.map((e) => e.operation)).toEqual([
      "create_account",
      "create_transaction",
      "update_transaction",
    ]);
    expect(entries[2]?.state).toBe("pending");
    expect(readTxn()?.payee).toBe(before?.payee);

    // The entry survives a relaunch, replayable — nothing was lost, only
    // deferred.
    stores.reopen();
    const entriesAfterReopen = stores.ledger.outbox.db.select().from(outbox).all();
    expect(entriesAfterReopen).toHaveLength(3);
    expect(readTxn()?.payee).toBe(before?.payee);
  });
});
