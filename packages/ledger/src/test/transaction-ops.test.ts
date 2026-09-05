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
import { defineLocalExecutor, LocalRefusal, localRegistry } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { categorizeBatchExecutor } from "../transactions/categorize-batch.executor.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import { setTransactionLinesExecutor } from "../transactions/set-transaction-lines.executor.ts";
import { supersedeTransactionExecutor } from "../transactions/supersede-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import { type Capture, type LocalTx, writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { categories, currencies, outbox, transactionLines, transactions } = ledgerSchema;
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

  it("refuses a patch that would turn the expense into a transfer-shaped row", () => {
    const OTHER_ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000c");
    writeLocally(stores.ledger, {
      executor: createAccountExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: OTHER_ACCOUNT, name: "Bank B · PLN", currency: PLN },
    });

    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          id: TXN,
          version: readTxn()?.version ?? 0,
          // TXN is still `type: "expense"` — the patch never touches `type`,
          // so naming a destination leg produces a row Postgres's
          // transactions_transfer_shape would refuse.
          patch: { toAccountId: OTHER_ACCOUNT, toAmount: "18", toCurrency: PLN },
        },
      }),
    ).toThrow(/shape/);

    // Refused, not half-applied.
    const after = readTxn();
    expect(after?.toAccountId).toBeNull();
    expect(after?.version).toBe(1);
  });

  it("refuses a patch that would set a category on a transfer", () => {
    const OTHER_ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000d");
    const TRANSFER = id<"transactions">("00000000-0000-4000-8000-000000000008");
    writeLocally(stores.ledger, {
      executor: createAccountExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: OTHER_ACCOUNT, name: "Bank C · PLN", currency: PLN },
    });
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TRANSFER,
        date: "2026-09-02",
        type: "transfer",
        accountId: ACCOUNT,
        amountOriginal: "5",
        currency: PLN,
        toAccountId: OTHER_ACCOUNT,
        toAmount: "5",
        toCurrency: PLN,
      },
    });
    const CATEGORY = id<"categories">("00000000-0000-4000-8000-0000000000c2");
    stores.ledger.replica.db
      .insert(categories)
      .values({ id: CATEGORY, name: "Groceries", kind: "expense", isLeaf: true })
      .run();

    const before = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, TRANSFER))
      .get();

    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: { id: TRANSFER, version: before?.version ?? 0, patch: { categoryId: CATEGORY } },
      }),
    ).toThrow(/shape/);

    const after = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, TRANSFER))
      .get();
    expect(after?.categoryId).toBeNull();
    expect(after?.version).toBe(before?.version);
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
    // input, an `apply` that always throws a `LocalRefusal`, standing in for
    // a replica commit that fails after the outbox commit already landed.
    type Tx = LocalTx<unknown, typeof ledgerSchema>;
    const failingUpdate = defineLocalExecutor<typeof updateTransactionExecutor.input, never, Tx>({
      operation: "update_transaction",
      opVersion: 1,
      input: updateTransactionExecutor.input,
      mints: () => [],
      apply: () => {
        throw new LocalRefusal("the replica half failed");
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
    // R2 H6 — blocked(terminal), not pending: a refusal must never leave a
    // drainable entry that only resends the same refusal forever.
    expect(entries[2]?.state).toBe("blocked");
    expect(entries[2]?.blockedKind).toBe("terminal");
    expect(entries[2]?.blockedReason).toBe("the replica half failed");
    expect(readTxn()?.payee).toBe(before?.payee);

    // The entry survives a relaunch, replayable — nothing was lost, only
    // deferred.
    stores.reopen();
    const entriesAfterReopen = stores.ledger.outbox.db.select().from(outbox).all();
    expect(entriesAfterReopen).toHaveLength(3);
    expect(readTxn()?.payee).toBe(before?.payee);
  });
});

describe("set_transaction_lines", () => {
  const readLines = () =>
    stores.ledger.replica.db
      .select()
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, TXN))
      .all();

  it("replaces the whole set, and refuses lines that do not sum to the transaction", () => {
    const v = () => readTxn()?.version ?? 0;

    writeLocally(stores.ledger, {
      executor: setTransactionLinesExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        transactionId: TXN,
        version: v(),
        lines: [
          {
            id: id<"transactionLines">("00000000-0000-4000-8000-0000000000a1"),
            description: "Espresso",
            amount: "10",
          },
          {
            id: id<"transactionLines">("00000000-0000-4000-8000-0000000000a2"),
            description: "Croissant",
            amount: "8",
          },
        ],
      },
    });
    expect(readLines()).toHaveLength(2);

    expect(() =>
      writeLocally(stores.ledger, {
        executor: setTransactionLinesExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          transactionId: TXN,
          version: v(),
          lines: [
            {
              id: id<"transactionLines">("00000000-0000-4000-8000-0000000000a3"),
              description: "Wrong",
              amount: "1",
            },
          ],
        },
      }),
    ).toThrow(/sum/);

    // The refused write left the previous two lines in place.
    expect(readLines()).toHaveLength(2);
  });

  it("removes every line when handed an empty set, regardless of the transaction's amount", () => {
    const v = () => readTxn()?.version ?? 0;
    writeLocally(stores.ledger, {
      executor: setTransactionLinesExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        transactionId: TXN,
        version: v(),
        lines: [
          {
            id: id<"transactionLines">("00000000-0000-4000-8000-0000000000b1"),
            description: "Whole thing",
            amount: "18",
          },
        ],
      },
    });

    writeLocally(stores.ledger, {
      executor: setTransactionLinesExecutor,
      registry: ledgerRegistry,
      capture,
      input: { transactionId: TXN, version: v(), lines: [] },
    });

    expect(readLines()).toHaveLength(0);
  });

  it("refuses a stale version", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: setTransactionLinesExecutor,
        registry: ledgerRegistry,
        capture,
        input: { transactionId: TXN, version: 999, lines: [] },
      }),
    ).toThrow(/stale/);
  });

  /**
   * H2 — `validate` refuses this before the outbox entry commits, not only
   * inside `apply`: a line past its parent's own currency scale (PLN, 2dp)
   * used to queue an entry `apply` would then refuse — a stuck entry with no
   * fix, since nothing will ever apply it. No entry means no orphan.
   */
  it("refuses a line past its parent's own currency scale before queuing an entry (H2)", () => {
    const v = () => readTxn()?.version ?? 0;
    const entries = () => stores.ledger.outbox.db.select().from(outbox).all();
    const before = entries().length;

    expect(() =>
      writeLocally(stores.ledger, {
        executor: setTransactionLinesExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          transactionId: TXN,
          version: v(),
          lines: [
            {
              id: id<"transactionLines">("00000000-0000-4000-8000-0000000000c1"),
              description: "Espresso",
              amount: "10.005",
            },
            {
              id: id<"transactionLines">("00000000-0000-4000-8000-0000000000c2"),
              description: "Croissant",
              amount: "7.995",
            },
          ],
        },
      }),
    ).toThrow(/holds more decimal places/);

    expect(entries()).toHaveLength(before);
    expect(readLines()).toHaveLength(0);
  });
});

describe("supersede_transaction", () => {
  it("soft-deletes the old row and lands the replacement in one write", () => {
    const NEW = id<"transactions">("00000000-0000-4000-8000-000000000002");

    writeLocally(stores.ledger, {
      executor: supersedeTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        supersedesId: TXN,
        supersedesVersion: readTxn()?.version ?? 0,
        replacement: {
          id: NEW,
          date: "2026-09-01",
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: "18.5",
          currency: PLN,
          payee: "Coffee",
          source: "import",
        },
      },
    });

    expect(readTxn()?.deletedAt).not.toBeNull();
    const replacement = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, NEW))
      .get();
    expect(replacement?.amountOriginal).toBe("18.50000000");
    expect(replacement?.source).toBe("import");
  });

  it("refuses a stale version on the row being replaced", () => {
    const NEW = id<"transactions">("00000000-0000-4000-8000-000000000003");
    expect(() =>
      writeLocally(stores.ledger, {
        executor: supersedeTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          supersedesId: TXN,
          supersedesVersion: 999,
          replacement: {
            id: NEW,
            date: "2026-09-01",
            type: "expense",
            accountId: ACCOUNT,
            amountOriginal: "18.5",
            currency: PLN,
            payee: "Coffee",
            source: "import",
          },
        },
      }),
    ).toThrow(/stale/);
    expect(readTxn()?.deletedAt).toBeNull();
  });

  it("refuses a replacement id that already names a live row — it must not clobber it", () => {
    const OTHER = id<"transactions">("00000000-0000-4000-8000-000000000006");
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: OTHER,
        date: "2026-09-01",
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: "42",
        currency: PLN,
        payee: "Rent",
      },
    });
    const otherBefore = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, OTHER))
      .get();

    expect(() =>
      writeLocally(stores.ledger, {
        executor: supersedeTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          supersedesId: TXN,
          supersedesVersion: readTxn()?.version ?? 0,
          replacement: {
            // Names an unrelated, already-existing row rather than a new one.
            id: OTHER,
            date: "2026-09-01",
            type: "expense",
            accountId: ACCOUNT,
            amountOriginal: "18.5",
            currency: PLN,
            payee: "Coffee",
            source: "import",
          },
        },
      }),
    ).toThrow(/replacement/);

    // Neither row moved: the superseded row is untouched, and the unrelated
    // row was not overwritten.
    expect(readTxn()?.deletedAt).toBeNull();
    const otherAfter = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, OTHER))
      .get();
    expect(otherAfter).toEqual(otherBefore);
  });

  /**
   * L10 — `insertTransaction` stopped checking scale itself (create_transaction's
   * own `validate` and `apply` were checking the identical value twice); this
   * proves `supersede_transaction` — the one caller with no `validate` of its
   * own and a genuinely new `replacement` — still gets that guarantee, from
   * its own explicit call to `assertTransactionScale`.
   */
  it("refuses a replacement past its own currency's scale, and leaves the superseded row untouched", () => {
    const NEW = id<"transactions">("00000000-0000-4000-8000-000000000007");
    expect(() =>
      writeLocally(stores.ledger, {
        executor: supersedeTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          supersedesId: TXN,
          supersedesVersion: readTxn()?.version ?? 0,
          replacement: {
            id: NEW,
            date: "2026-09-01",
            type: "expense",
            accountId: ACCOUNT,
            amountOriginal: "18.505",
            currency: PLN,
            payee: "Coffee",
            source: "import",
          },
        },
      }),
    ).toThrow(/holds more decimal places/);

    expect(readTxn()?.deletedAt).toBeNull();
    expect(
      stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, NEW)).get(),
    ).toBeUndefined();
  });

  it("refuses a replacement id that names a soft-deleted row — it must not resurrect it", () => {
    const OTHER = id<"transactions">("00000000-0000-4000-8000-000000000007");
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: OTHER,
        date: "2026-09-01",
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: "42",
        currency: PLN,
        payee: "Rent",
      },
    });
    writeLocally(stores.ledger, {
      executor: deleteTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: OTHER,
        version:
          stores.ledger.replica.db
            .select()
            .from(transactions)
            .where(eq(transactions.id, OTHER))
            .get()?.version ?? 0,
      },
    });

    expect(() =>
      writeLocally(stores.ledger, {
        executor: supersedeTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          supersedesId: TXN,
          supersedesVersion: readTxn()?.version ?? 0,
          replacement: {
            id: OTHER,
            date: "2026-09-01",
            type: "expense",
            accountId: ACCOUNT,
            amountOriginal: "18.5",
            currency: PLN,
            payee: "Coffee",
            source: "import",
          },
        },
      }),
    ).toThrow(/replacement/);

    expect(readTxn()?.deletedAt).toBeNull();
    // Still deleted — a refused write must not bring it back to life.
    const otherAfter = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, OTHER))
      .get();
    expect(otherAfter?.deletedAt).not.toBeNull();
  });
});

describe("categorize_batch", () => {
  const CATEGORY = id<"categories">("00000000-0000-4000-8000-0000000000c1");
  const TXN2 = id<"transactions">("00000000-0000-4000-8000-000000000004");
  const TRANSFER_ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000b");

  beforeEach(() => {
    stores.ledger.replica.db
      .insert(categories)
      .values({ id: CATEGORY, name: "Groceries", kind: "expense", isLeaf: true })
      .run();
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN2,
        date: "2026-09-02",
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: "5",
        currency: PLN,
        payee: "Bread",
      },
    });
  });

  it("sets one category on every named id", () => {
    writeLocally(stores.ledger, {
      executor: categorizeBatchExecutor,
      registry: ledgerRegistry,
      capture,
      input: { transactionIds: [TXN, TXN2], categoryId: CATEGORY },
    });

    expect(readTxn()?.categoryId).toBe(CATEGORY);
    const other = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, TXN2))
      .get();
    expect(other?.categoryId).toBe(CATEGORY);
  });

  it("refuses the whole batch when one named id is missing, and categorises nothing", () => {
    const MISSING = id<"transactions">("00000000-0000-4000-8000-0000000000ff");

    expect(() =>
      writeLocally(stores.ledger, {
        executor: categorizeBatchExecutor,
        registry: ledgerRegistry,
        capture,
        input: { transactionIds: [TXN, MISSING], categoryId: CATEGORY },
      }),
    ).toThrow(/categorize_batch/);

    expect(readTxn()?.categoryId).toBeNull();
  });

  it("refuses a transfer — only income and expense carry a category", () => {
    writeLocally(stores.ledger, {
      executor: createAccountExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TRANSFER_ACCOUNT, name: "Bank B · PLN", currency: PLN },
    });
    const TRANSFER = id<"transactions">("00000000-0000-4000-8000-000000000005");
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TRANSFER,
        date: "2026-09-02",
        type: "transfer",
        accountId: ACCOUNT,
        amountOriginal: "5",
        currency: PLN,
        toAccountId: TRANSFER_ACCOUNT,
        toAmount: "5",
        toCurrency: PLN,
      },
    });

    expect(() =>
      writeLocally(stores.ledger, {
        executor: categorizeBatchExecutor,
        registry: ledgerRegistry,
        capture,
        input: { transactionIds: [TRANSFER], categoryId: CATEGORY },
      }),
    ).toThrow(/categorize_batch/);
  });

  it("accepts a batch that names the same id twice — a repeat is not a missing row", () => {
    writeLocally(stores.ledger, {
      executor: categorizeBatchExecutor,
      registry: ledgerRegistry,
      capture,
      input: { transactionIds: [TXN, TXN], categoryId: CATEGORY },
    });

    expect(readTxn()?.categoryId).toBe(CATEGORY);
  });
});
