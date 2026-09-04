/**
 * The local write path, tested on the property that replaced "both, or
 * neither".
 *
 * That phrase was true while both tables lived in one file. §5.7 puts them in
 * two, and SQLite offers no atomic commit across two databases in WAL mode — so
 * the guarantee is now an **ordering**, and these tests are about which half
 * survives a crash rather than about neither surviving.
 *
 * The outbox entry commits first because it is the only copy of unsent intent.
 * So the window a kill can open is *an entry whose row is missing*, never a row
 * that will never be sent. The first is repairable and `recover.test.ts` proves
 * it; the second is not repairable by anything, which is why the order is this
 * way round.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineLocalExecutor, localRegistry } from "../executor.ts";
import { readAppliedSeq } from "../migrate.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type Capture, type LocalTx, writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, counterparties, currencies, outbox, transactions } = schema;

type Tx = LocalTx<Database.RunResult, typeof schema>;

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  seedReferences();
});

afterEach(() => {
  s?.close();
});

/** The rows a transaction's foreign keys point at. The replica enforces them. */
function seedReferences() {
  s.ledger.replica.db
    .insert(currencies)
    .values({ code: currencyCode("PLN"), name: "Placeholder" })
    .onConflictDoNothing()
    .run();
  s.ledger.replica.db
    .insert(accounts)
    .values({ id: id<"accounts">("acc-1"), name: "Bank A · PLN", currency: currencyCode("PLN") })
    .onConflictDoNothing()
    .run();
}

const CREATE_TRANSACTION = z.object({
  id: z.string(),
  account_id: z.string(),
  amount_original: z.string(),
  /**
   * Optional, and it is what the dependency scan actually matches on.
   *
   * Worth stating because it caught this test out: the outbox stores the
   * **parsed** payload, and Zod strips what the schema does not declare. An id
   * passed in a field the operation never declared is gone before `deriveDeps`
   * ever sees it — which is correct (what replays must be what the operation
   * accepted) and means the scan can only find ids the schema names.
   */
  counterparty_id: z.string().optional(),
});

const CREATE_COUNTERPARTY = z.object({ id: z.string(), name: z.string() });

const createCounterparty = defineLocalExecutor<typeof CREATE_COUNTERPARTY, { id: string }, Tx>({
  operation: "create_counterparty",
  opVersion: 1,
  input: CREATE_COUNTERPARTY,
  mints: (input) => [input.id],
  apply: (input, tx) => {
    const [row] = tx
      .insert(counterparties)
      .values({ id: id<"counterparties">(input.id), name: input.name, nameFolded: input.name })
      .returning({ id: counterparties.id })
      .all();
    if (!row) throw new Error("no row returned");
    return row;
  },
});

const createTransaction = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
  operation: "create_transaction",
  opVersion: 1,
  input: CREATE_TRANSACTION,
  mints: (input) => [input.id],
  apply: (input, tx) => {
    const [row] = tx
      .insert(transactions)
      .values({
        id: id<"transactions">(input.id) as Id<"transactions">,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: id<"accounts">(input.account_id),
        ...(input.counterparty_id
          ? { counterpartyId: id<"counterparties">(input.counterparty_id) }
          : {}),
        amountOriginal: money.toMoney(input.amount_original),
        currency: currencyCode("PLN"),
        fxRate: money.pivotPerUnit("1.000000000000"),
      })
      .returning({ id: transactions.id })
      .all();
    if (!row) throw new Error("no row returned");
    return row;
  },
});

/** An executor that mints nothing and always refuses — the crash in test form. */
const refuses = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
  operation: "refuses",
  opVersion: 1,
  input: CREATE_TRANSACTION,
  mints: () => [],
  apply: () => {
    throw new Error("the replica half failed");
  },
});

const registry = localRegistry<Tx>([createTransaction, createCounterparty, refuses]);

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

const input = (txnId: string) => ({
  id: txnId,
  account_id: "acc-1",
  amount_original: "18.00000000",
});

const entries = () => s.ledger.outbox.db.select().from(outbox).all();
const rows = () => s.ledger.replica.db.select().from(transactions).all();

describe("a write records its intent and materialises", () => {
  it("lands both halves, and moves the watermark to match", () => {
    const result = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-1"),
      capture,
    });

    expect(rows()).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    expect(result.seq).toBe(1);
    // The watermark is what says the replica has caught up. If it lagged, the
    // next launch would replay a write that already landed.
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(1);
  });

  it("stores the zone and the offset beside the entry, not merged into a date", () => {
    writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-1"),
      capture,
    });

    const [entry] = entries();
    expect(entry?.capturedTz).toBe("Europe/Warsaw");
    // Carried separately because the zone alone cannot reconstruct a past
    // offset — the same zone differs either side of a DST boundary.
    expect(entry?.capturedOffsetMinutes).toBe(60);
  });

  it("orders by seq, and the numbers do not repeat", () => {
    const a = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-1"),
      capture,
    });
    const b = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-2"),
      capture,
    });

    expect([a.seq, b.seq]).toEqual([1, 2]);
  });

  it("derives a dependency on the entry that mints the id it names", () => {
    // `08`'s own example: a counterparty created offline, then a transaction
    // naming it. Sent out of order the transaction is a 404 and blocks, for
    // something nobody did wrong.
    const first = writeLocally(s.ledger, {
      executor: createCounterparty,
      registry,
      input: { id: "cp-1", name: "Placeholder" },
      capture,
    });

    const second = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: { ...input("txn-1"), counterparty_id: "cp-1" },
      capture,
    });

    expect(second.deps).toEqual([first.entryId]);
    expect(first.deps).toEqual([]);
  });

  it("does not invent a dependency when nothing queued mints the id", () => {
    // The counterparty already exists locally and was acknowledged long ago —
    // naming it must not hold the transaction behind anything.
    s.ledger.replica.db
      .insert(counterparties)
      .values({
        id: id<"counterparties">("cp-old"),
        name: "Placeholder",
        nameFolded: "placeholder",
      })
      .run();

    const only = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: { ...input("txn-1"), counterparty_id: "cp-old" },
      capture,
    });

    expect(only.deps).toEqual([]);
  });
});

describe("invalid input never reaches either store", () => {
  it("throws before writing anything at all", () => {
    expect(() =>
      writeLocally(s.ledger, {
        executor: createTransaction,
        registry,
        input: { id: "txn-1", account_id: "acc-1" },
        capture,
      }),
    ).toThrow();

    // The parse runs outside both transactions, so there is no entry to repair
    // and no row to explain.
    expect(entries()).toHaveLength(0);
    expect(rows()).toHaveLength(0);
  });
});

describe("a failure between the two commits keeps the intent", () => {
  it("leaves the entry and no row — the crash the reconciler exists for", () => {
    expect(() =>
      writeLocally(s.ledger, { executor: refuses, registry, input: input("txn-1"), capture }),
    ).toThrow("the replica half failed");

    // This is the asymmetry the whole design turns on. The capture is not lost:
    // it is queued, and its local effect is missing until replay.
    expect(entries()).toHaveLength(1);
    expect(rows()).toHaveLength(0);
    // The watermark did not move, which is what tells the next launch to replay.
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(0);

    // R2 H6 — a refusal marks the entry `blocked(terminal)` in this same
    // catch, so it can never be picked up by a drain that would only resend
    // the same refusal forever. `pending` is the bug this replaces.
    const [entry] = entries();
    expect(entry?.state).toBe("blocked");
    expect(entry?.blockedKind).toBe("terminal");
    expect(entry?.blockedReason).toBe("the replica half failed");
    // R2 M4 — `refused`, never `recover.ts`'s `replay_halted`: this write's
    // own `apply` rejected it, so it will refuse identically on any retry.
    expect(entry?.blockedDisposition).toBe("refused");
  });

  /**
   * R2 L1 — if marking the entry `blocked` itself throws, the caller must
   * not lose the refusal that got it there: it travels as `cause` rather
   * than being swallowed by whatever broke the second write.
   */
  it("attaches the original refusal as `cause` when marking it blocked also fails", () => {
    const blockWriteError = new Error("outbox db is locked");
    const updateSpy = vi.spyOn(s.ledger.outbox.db, "update").mockImplementation(() => {
      throw blockWriteError;
    });

    let caught: unknown;
    try {
      writeLocally(s.ledger, { executor: refuses, registry, input: input("txn-1"), capture });
    } catch (e) {
      caught = e;
    } finally {
      updateSpy.mockRestore();
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error;
    expect(err.message).toContain("failed to mark");
    expect(err.message).toContain("outbox db is locked");
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toBe("the replica half failed");

    // The block-write never landed, so the entry is exactly as the first
    // commit left it — `pending`, not silently stuck looking sendable, but
    // also not misreported as `blocked`.
    const [entry] = entries();
    expect(entry?.state).toBe("pending");
  });

  it("reports which commit boundary failed with the complete cause chain", () => {
    const diagnostics: object[] = [];
    const databaseError = Object.assign(new Error("database is busy"), { code: "SQLITE_BUSY" });
    const failure = new Error("the replica half failed", { cause: databaseError });
    const failsWithCause = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
      operation: "fails_with_cause",
      opVersion: 1,
      input: CREATE_TRANSACTION,
      mints: () => [],
      apply: () => {
        throw failure;
      },
    });
    const diagnosticRegistry = localRegistry([createTransaction, failsWithCause]);

    expect(() =>
      writeLocally(s.ledger, {
        executor: failsWithCause,
        registry: diagnosticRegistry,
        input: input("txn-1"),
        capture,
        diagnostics: (event: object) => diagnostics.push(event),
      }),
    ).toThrow("the replica half failed");

    expect(diagnostics).toEqual([
      {
        scope: "local_write",
        phase: "start",
        boundary: "outbox",
        operation: "fails_with_cause",
      },
      {
        scope: "local_write",
        phase: "success",
        boundary: "outbox",
        operation: "fails_with_cause",
        seq: 1,
      },
      {
        scope: "local_write",
        phase: "start",
        boundary: "replica",
        operation: "fails_with_cause",
        seq: 1,
      },
      {
        scope: "local_write",
        phase: "failure",
        boundary: "replica",
        operation: "fails_with_cause",
        seq: 1,
        error: {
          name: "Error",
          message: "the replica half failed",
          stack: expect.any(String),
          cause: {
            name: "Error",
            message: "database is busy",
            code: "SQLITE_BUSY",
            stack: expect.any(String),
          },
        },
      },
    ]);
  });

  it("does not let a diagnostic sink break a successful write", () => {
    const brokenSink = vi.fn(() => {
      throw new Error("console transport failed");
    });

    const result = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-1"),
      capture,
      diagnostics: brokenSink,
    });

    expect(result.row.id).toBe("txn-1");
    expect(entries()).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(brokenSink).toHaveBeenCalled();
  });
});

describe("the two stores are two files", () => {
  it("keeps the outbox out of the replica, and the ledger out of the outbox", () => {
    const tablesIn = (db: Database.Database) =>
      db
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((row) => (row as { name: string }).name);

    const replica = new Database(s.paths.replica);
    const outboxDb = new Database(s.paths.outbox);

    try {
      // §5.7: a replica refetch must never touch the outbox. That is only true
      // if the outbox is not in the file being refetched.
      expect(tablesIn(replica)).toContain("transactions");
      expect(tablesIn(replica)).not.toContain("outbox");
      expect(tablesIn(outboxDb)).toContain("outbox");
      expect(tablesIn(outboxDb)).not.toContain("transactions");
    } finally {
      replica.close();
      outboxDb.close();
    }
  });
});

describe("the entry the caller is handed", () => {
  it("names the row it wrote and the key the server will deduplicate on", () => {
    const result = writeLocally(s.ledger, {
      executor: createTransaction,
      registry,
      input: input("txn-1"),
      capture,
    });

    expect(result.row.id).toBe("txn-1");
    const [entry] = s.ledger.outbox.db
      .select()
      .from(outbox)
      .where(eq(outbox.id, result.entryId))
      .all();
    expect(entry?.operation).toBe("create_transaction");
    expect(entry?.state).toBe("pending");
  });
});
