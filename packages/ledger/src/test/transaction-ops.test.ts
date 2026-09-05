/**
 * The transaction operations beyond create, on two real files. Each op:
 * lands the row and its outbox entry; refuses what operations.md says it
 * must; and a crash between the two stores leaves neither the update nor its
 * mark on the row — the property write.test.ts proves for create, restated
 * per op because a new executor is a new chance to break it.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { defineLocalExecutor, LocalRefusal, localRegistry } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { categorizeBatchExecutor } from "../transactions/categorize-batch.executor.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import { readRecent } from "../transactions/read-recent.ts";
import { searchTransactions } from "../transactions/search-transactions.ts";
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

/** `SPEC.md` §14.4b — resolved offline, at write time, by every path that produces a row. */
describe("brand recognition (§14.4b)", () => {
  const ORLEN = id<"transactions">("00000000-0000-4000-8000-000000000b01");

  it("matches a recognised payee and sources it 'auto', with no caller input", () => {
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: ORLEN,
        date: "2026-09-01",
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: "184.30",
        currency: PLN,
        payee: "ORLEN",
      },
    });
    const row = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ORLEN))
      .get();
    expect(row?.brandKey).toBe("orlen");
    expect(row?.brandSource).toBe("auto");
  });

  it("leaves both fields null for an unrecognised payee — never one alone", () => {
    // `TXN` (beforeEach) is payee "Coffee", which matches nothing.
    const row = readTxn();
    expect(row?.brandKey).toBeNull();
    expect(row?.brandSource).toBeNull();
  });

  it("an asserted brandKey wins over the payee and is sourced 'manual'", () => {
    writeLocally(stores.ledger, {
      executor: createTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: ORLEN,
        date: "2026-09-01",
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: "10",
        currency: PLN,
        payee: "Corner Café",
        brandKey: "youtube",
      },
    });
    const row = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ORLEN))
      .get();
    expect(row?.brandKey).toBe("youtube");
    expect(row?.brandSource).toBe("manual");
  });

  it("refuses a brandKey the bundled catalogue does not carry — never an upstream slug", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          id: ORLEN,
          date: "2026-09-01",
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: "10",
          currency: PLN,
          // Invented — never a real merchant not already in the catalogue
          // (CLAUDE.md: placeholders only).
          payee: "Waltco",
          brandKey: "waltco",
        },
      }),
    ).toThrow(/brand catalogue/);
  });

  it("re-matches a patched payee when the row carries no manual assignment (source null)", () => {
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { payee: "ORLEN" } },
    });
    const after = readTxn();
    expect(after?.brandKey).toBe("orlen");
    expect(after?.brandSource).toBe("auto");
  });

  /**
   * §14.4b re-runs the match *"when `payee` changes"* — a patch that re-sends
   * the payee it already read, which is what a form doing a full-object
   * submit does, is not a change and must resolve nothing.
   *
   * The row is set up in the one state where the two readings differ: a
   * payee that folds to a catalogue alias with both brand columns `NULL` —
   * what a row synced from a build whose catalogue was narrower looks like.
   * A presence-based gate re-matches it into `orlen`/`auto` on an unrelated
   * edit; a value-based one leaves it exactly as the writer left it.
   */
  it("a patch re-sending the same payee does not re-match — the gate is a change, not presence", () => {
    const created = readTxn();
    stores.ledger.replica.db
      .update(transactions)
      .set({ payee: "ORLEN", brandKey: null, brandSource: null })
      .where(eq(transactions.id, TXN))
      .run();

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN,
        version: created?.version ?? 0,
        patch: { payee: "ORLEN", note: "an unrelated edit" },
      },
    });
    const after = readTxn();
    expect(after?.note).toBe("an unrelated edit");
    expect(after?.brandKey, "the payee did not change, so nothing was resolved").toBeNull();
    expect(after?.brandSource).toBeNull();
  });

  /**
   * `{ brandKey: undefined }` is what a caller spreading an optional field
   * builds. It asserts nothing — reading it as "the patch touches brandKey"
   * would make an unrelated edit re-resolve a column the writer never named.
   */
  it("an undefined brandKey is not a touch — the same row is left alone", () => {
    const created = readTxn();
    stores.ledger.replica.db
      .update(transactions)
      .set({ payee: "ORLEN", brandKey: null, brandSource: null })
      .where(eq(transactions.id, TXN))
      .run();

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN,
        version: created?.version ?? 0,
        patch: { brandKey: undefined, note: "still unrelated" },
      },
    });
    const after = readTxn();
    expect(after?.note).toBe("still unrelated");
    expect(after?.brandKey).toBeNull();
    expect(after?.brandSource).toBeNull();
  });

  it("re-matches a patched payee when the row carries an 'auto' match already", () => {
    const before = readTxn();
    // Land on an "auto" match first.
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { payee: "ORLEN" } },
    });
    const auto = readTxn();
    expect(auto?.brandSource).toBe("auto");

    // A further payee edit re-matches again — "auto" is not sticky.
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: auto?.version ?? 0, patch: { payee: "YouTube" } },
    });
    const after = readTxn();
    expect(after?.brandKey).toBe("youtube");
    expect(after?.brandSource).toBe("auto");
  });

  it("a manual assignment is sticky against a later payee edit", () => {
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { brandKey: "youtube" } },
    });
    const manual = readTxn();
    expect(manual?.brandSource).toBe("manual");

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN,
        version: manual?.version ?? 0,
        patch: { payee: "Some other payee entirely" },
      },
    });
    const after = readTxn();
    expect(after?.brandKey).toBe("youtube");
    expect(after?.brandSource).toBe("manual");
  });

  /**
   * §14.4b's clear. `brandKey: null` writes `brand_source 'none'` rather
   * than falling back through the match, because the payee still folds to a
   * catalogue alias and the whole point of clearing a wrong match is that it
   * does not come straight back on the next write.
   */
  it("clearing brandKey with null is a deliberate, sticky 'no brand' — it does not re-match", () => {
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN,
        version: before?.version ?? 0,
        patch: { payee: "ORLEN", brandKey: "youtube" },
      },
    });
    const manual = readTxn();
    expect(manual?.brandKey).toBe("youtube");

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: manual?.version ?? 0, patch: { brandKey: null } },
    });
    const cleared = readTxn();
    expect(cleared?.brandKey).toBeNull();
    expect(cleared?.brandSource).toBe("none");

    // The payee ("ORLEN") still folds to a catalogue alias — a further,
    // unrelated payee edit must not bring the match back.
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: cleared?.version ?? 0, patch: { note: "unrelated" } },
    });
    const after = readTxn();
    expect(after?.brandKey).toBeNull();
    expect(after?.brandSource).toBe("none");
  });

  it("'none' stays sticky across a payee edit too", () => {
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { brandKey: null } },
    });
    const cleared = readTxn();
    expect(cleared?.brandSource).toBe("none");

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: cleared?.version ?? 0, patch: { payee: "ORLEN" } },
    });
    const after = readTxn();
    expect(after?.brandKey).toBeNull();
    expect(after?.brandSource).toBe("none");
  });

  it("an explicit brandKey still overrides a sticky 'none'", () => {
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: before?.version ?? 0, patch: { brandKey: null } },
    });
    const cleared = readTxn();

    writeLocally(stores.ledger, {
      executor: updateTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: cleared?.version ?? 0, patch: { brandKey: "orlen" } },
    });
    const after = readTxn();
    expect(after?.brandKey).toBe("orlen");
    expect(after?.brandSource).toBe("manual");
  });

  it("supersede_transaction resolves the brand of its replacement, the same as create", () => {
    const REPLACEMENT = id<"transactions">("00000000-0000-4000-8000-000000000b02");
    const before = readTxn();
    writeLocally(stores.ledger, {
      executor: supersedeTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        supersedesId: TXN,
        supersedesVersion: before?.version ?? 0,
        replacement: {
          id: REPLACEMENT,
          date: "2026-09-01",
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: "184.30",
          currency: PLN,
          payee: "ORLEN",
          source: "import",
        },
      },
    });
    const replaced = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, REPLACEMENT))
      .get();
    expect(replaced?.brandKey).toBe("orlen");
    expect(replaced?.brandSource).toBe("auto");
  });

  it("the transactions_brand_shape CHECK refuses a raw insert with only one field set (L)", () => {
    expect(() =>
      stores.ledger.replica.db
        .insert(transactions)
        .values({
          id: id<"transactions">("00000000-0000-4000-8000-000000000b03"),
          date: accountingDate("2026-09-01"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("10"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
          brandKey: "orlen",
        })
        .run(),
    ).toThrow(/CHECK constraint failed/i);
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

  /**
   * **The two reads S04 tells its empties apart with, on the one ledger where
   * they could disagree.** The Recent window (`readRecent`) is what the screen
   * draws; the unfiltered count (`searchTransactions({})`) is what decides
   * whether *No transactions yet* is a true sentence. A ledger whose every row
   * is soft-deleted is the case worth pinning: the row is still in the table,
   * so a read that forgot `deleted_at` would return it, and the screen would
   * then draw an empty Recent card over a count that says rows exist.
   *
   * Both exclude it, so a ledger emptied by deletion genuinely is first-run
   * again — S04's wording is right, and it is right for a reason this test
   * states rather than a coincidence the screen assumed.
   */
  it("leaves both of S04's reads empty — the window and the unfiltered count", () => {
    writeLocally(stores.ledger, {
      executor: deleteTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: TXN, version: readTxn()?.version ?? 0 },
    });

    // The row is still there — this is a soft delete, not a gap in the fixture.
    expect(readTxn()).toBeDefined();
    expect(readRecent(stores.ledger.replica.db, 5)).toEqual([]);
    expect(searchTransactions(stores.ledger.replica.db, {}).total.count).toBe(0);
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

  /**
   * DESK3 review round 1, C2 layer 2 — the executor's own kind check, both
   * directions, the same pair `packages/db/src/test/category-kind.test.ts`
   * runs for Postgres's WA017. `TXN` and `CATEGORY` are both `expense` by the
   * two `beforeEach`s above, so each test only has to add the one row or
   * category of the other kind.
   */
  describe("H1-b — a category's kind must match every named row's type", () => {
    const INCOME_CATEGORY = id<"categories">("00000000-0000-4000-8000-0000000000c2");
    const INCOME_TXN = id<"transactions">("00000000-0000-4000-8000-000000000006");

    beforeEach(() => {
      stores.ledger.replica.db
        .insert(categories)
        .values({ id: INCOME_CATEGORY, name: "Salary", kind: "income", isLeaf: true })
        .run();
      writeLocally(stores.ledger, {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          id: INCOME_TXN,
          date: "2026-09-03",
          type: "income",
          accountId: ACCOUNT,
          amountOriginal: "9200",
          currency: PLN,
          payee: "Salary",
        },
      });
    });

    it("refuses an expense category on an income row", () => {
      expect(() =>
        writeLocally(stores.ledger, {
          executor: categorizeBatchExecutor,
          registry: ledgerRegistry,
          capture,
          input: { transactionIds: [INCOME_TXN], categoryId: CATEGORY },
        }),
      ).toThrow(/categorize_batch/);

      const row = stores.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, INCOME_TXN))
        .get();
      expect(row?.categoryId).toBeNull();
    });

    it("refuses an income category on an expense row", () => {
      expect(() =>
        writeLocally(stores.ledger, {
          executor: categorizeBatchExecutor,
          registry: ledgerRegistry,
          capture,
          input: { transactionIds: [TXN], categoryId: INCOME_CATEGORY },
        }),
      ).toThrow(/categorize_batch/);

      expect(readTxn()?.categoryId).toBeNull();
    });

    it("refuses a batch mixing an income row into an otherwise-valid expense batch", () => {
      expect(() =>
        writeLocally(stores.ledger, {
          executor: categorizeBatchExecutor,
          registry: ledgerRegistry,
          capture,
          input: { transactionIds: [TXN, INCOME_TXN], categoryId: CATEGORY },
        }),
      ).toThrow(/categorize_batch/);

      // All or nothing — the batch's one valid row is not categorised either.
      expect(readTxn()?.categoryId).toBeNull();
    });

    /**
     * C2 layer 3 — broken once, per `CLAUDE.md`'s own rule for a new
     * guarantee. This writes straight to the replica through drizzle,
     * skipping `categorizeBatchExecutor`'s own `WHERE` entirely, so the only
     * thing that can refuse it is `transactions_category_kind_matches_type_
     * update` — created, like every hand-written replica trigger, by
     * `migrate.ts`'s `REPLICA_BACKFILLS["0010_schema"].objects` hook on the
     * chain's head, never by a generated `.sql` — the backstop this
     * executor's own doc comment names.
     */
    it("the replica's own trigger refuses a raw UPDATE the executor never ran (C2 layer 3)", () => {
      expect(() =>
        stores.ledger.replica.db
          .update(transactions)
          .set({ categoryId: CATEGORY })
          .where(eq(transactions.id, INCOME_TXN))
          .run(),
      ).toThrow(/WA017/);
    });

    /**
     * The insert-time twin of the trigger above — a freshly inserted row,
     * not an update. The values are an existing row read back and altered,
     * rather than a literal: `transactions` carries three dozen columns and
     * a hand-written literal here would be a second, drifting statement of
     * what a valid row is. Only `id` and `categoryId` differ, so the one
     * thing under test is the one thing that changed.
     */
    it("the replica's own trigger refuses a raw INSERT carrying the wrong kind (C2 layer 3)", () => {
      const BAD_INSERT = id<"transactions">("00000000-0000-4000-8000-000000000007");
      const template = stores.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, INCOME_TXN))
        .get();
      if (template === undefined) throw new Error("the income row the beforeEach wrote is missing");

      expect(() =>
        stores.ledger.replica.db
          .insert(transactions)
          .values({ ...template, id: BAD_INSERT, categoryId: CATEGORY })
          .run(),
      ).toThrow(/WA017/);
    });
  });
});

/**
 * H1a — an archived category is not assignable, at both levels the rule has:
 * the executor's own refusal (a good error, named), and the replica's own
 * triggers (`transactions_category_not_archived_insert` / `_update` and
 * `transaction_lines_category_not_archived_insert` / `_update`, the head
 * migration), which hold when the code above them is wrong or absent.
 *
 * **Both tables, and all four operations that can move a `category_id`** —
 * `create_transaction`, `update_transaction`, `set_transaction_lines` and
 * `categorize_batch`. A rule enforced on one of the two tables that carry the
 * column is a rule with a hole in it, and `transaction_lines` is the half the
 * parent row hides.
 *
 * The defect this closes: D2's payee memory proposed a leaf a payee last sat
 * on, `readPayeeHistory` did not exclude archived ones, the desk command bar
 * auto-filled the id, rendered it as "Category?" because no picker offers an
 * archived category, and Enter saved it.
 */
describe("an archived category", () => {
  const ARCHIVED = id<"categories">("00000000-0000-4000-8000-0000000000a1");
  const NEW_TXN = id<"transactions">("00000000-0000-4000-8000-0000000000a2");

  beforeEach(() => {
    // Inserted live, then retired — the only way a row can hold an archived
    // category at all, and exactly how S07's own archive action leaves one.
    stores.ledger.replica.db
      .insert(categories)
      .values({ id: ARCHIVED, name: "Retired", kind: "expense", isLeaf: true })
      .run();
    stores.ledger.replica.db
      .update(categories)
      .set({ archived: true })
      .where(eq(categories.id, ARCHIVED))
      .run();
  });

  it("create_transaction refuses it by name", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          id: NEW_TXN,
          date: "2026-09-03",
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: "9",
          currency: PLN,
          payee: "Gym",
          categoryId: ARCHIVED,
        },
      }),
    ).toThrow(LocalRefusal);
    expect(
      stores.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, NEW_TXN))
        .get(),
      "nothing landed",
    ).toBeUndefined();
  });

  it("update_transaction refuses a patch that moves onto it", () => {
    const before = readTxn();
    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateTransactionExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          id: TXN,
          version: before?.version ?? 0,
          patch: { categoryId: ARCHIVED },
        },
      }),
    ).toThrow(LocalRefusal);
    expect(readTxn()?.categoryId).toBeNull();
  });

  /**
   * Broken once: the executor's refusal skipped entirely, writing straight at
   * the table the way a future op with no such check would. SQLite refuses it,
   * not the code — which is the whole point of the trigger existing beside the
   * check rather than instead of it.
   */
  it("the replica itself refuses the insert, with no executor in the way", () => {
    expect(() =>
      stores.ledger.replica.db
        .insert(transactions)
        .values({
          id: NEW_TXN,
          date: accountingDate("2026-09-03"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: toMoney("9"),
          currency: PLN,
          fxRate: pivotPerUnit("1"),
          payee: "Gym",
          categoryId: ARCHIVED,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run(),
    ).toThrow(/archived/i);
  });

  it("the replica itself refuses an update onto it, with no executor in the way", () => {
    expect(() =>
      stores.ledger.replica.db
        .update(transactions)
        .set({ categoryId: ARCHIVED })
        .where(eq(transactions.id, TXN))
        .run(),
    ).toThrow(/archived/i);
    expect(readTxn()?.categoryId).toBeNull();
  });

  /**
   * And the archiving itself stays legal — a category that already holds rows
   * is exactly the case archiving exists for, and a guard refusing it would
   * make any used category permanently un-retireable.
   */
  it("can still be archived under the rows it already holds", () => {
    const LIVE = id<"categories">("00000000-0000-4000-8000-0000000000a3");
    stores.ledger.replica.db
      .insert(categories)
      .values({ id: LIVE, name: "Groceries", kind: "expense", isLeaf: true })
      .run();
    writeLocally(stores.ledger, {
      executor: categorizeBatchExecutor,
      registry: ledgerRegistry,
      capture,
      input: { transactionIds: [TXN], categoryId: LIVE },
    });

    stores.ledger.replica.db
      .update(categories)
      .set({ archived: true })
      .where(eq(categories.id, LIVE))
      .run();

    expect(readTxn()?.categoryId, "the row keeps its history").toBe(LIVE);
  });

  /**
   * M1 — a split line carries its own `category_id`, and it is the copy the
   * parent row hides: the transaction shows a category the reader recognises
   * while the line beneath it points at a leaf no picker offers.
   */
  it("set_transaction_lines refuses a line that carries it, naming the operation and the field", () => {
    const readLines = () =>
      stores.ledger.replica.db
        .select()
        .from(transactionLines)
        .where(eq(transactionLines.transactionId, TXN))
        .all();
    const LIVE_LINE = id<"transactionLines">("00000000-0000-4000-8000-0000000000b0");
    const LINE = id<"transactionLines">("00000000-0000-4000-8000-0000000000b1");

    // A set already on the row, so the refusal below has something to
    // preserve. Note what this alone does *not* prove — see the next test.
    writeLocally(stores.ledger, {
      executor: setTransactionLinesExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        transactionId: TXN,
        version: readTxn()?.version ?? 0,
        lines: [{ id: LIVE_LINE, description: "Espresso", amount: "18" }],
      },
    });
    expect(readLines()).toHaveLength(1);

    expect(() =>
      writeLocally(stores.ledger, {
        executor: setTransactionLinesExecutor,
        registry: ledgerRegistry,
        capture,
        input: {
          transactionId: TXN,
          version: readTxn()?.version ?? 0,
          lines: [{ id: LINE, description: "Espresso", amount: "18", categoryId: ARCHIVED }],
        },
      }),
    ).toThrow(/set_transaction_lines.*category_id.*archived/s);

    const after = readLines();
    expect(after, "the old set is still there, whole").toHaveLength(1);
    expect(after[0]?.id).toBe(LIVE_LINE);
  });

  /**
   * L-a — the ordering itself, which the test above cannot see.
   *
   * `writeLocally` wraps `apply` in one SQLite transaction, so a delete that
   * *did* run before the refusal would be rolled back and the table would read
   * back identical either way: the assertion above passes whether the check
   * sits before the delete or after it, which makes it an assertion about
   * atomicity, not about order. Both are worth having and they are not the
   * same guarantee — atomicity is `write.ts`'s and holds for every op; this
   * ordering is `replaceLines`' own, and it is the one a future edit can
   * break by moving a line.
   *
   * So the read happens **inside the transaction the refusal is thrown out
   * of**, before the rollback: a delete that had already run would be visible
   * to its own transaction as an empty table, rolled back or not. `apply` is
   * called directly, with a handle this test opened, because that is the only
   * way to be standing inside that transaction when the throw goes past.
   */
  it("set_transaction_lines refuses before it deletes — read from inside the failing transaction", () => {
    const LIVE_LINE = id<"transactionLines">("00000000-0000-4000-8000-0000000000c0");
    const LINE = id<"transactionLines">("00000000-0000-4000-8000-0000000000c1");

    writeLocally(stores.ledger, {
      executor: setTransactionLinesExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        transactionId: TXN,
        version: readTxn()?.version ?? 0,
        lines: [{ id: LIVE_LINE, description: "Espresso", amount: "18" }],
      },
    });

    // Counted, not remembered in a `let`: the refusal unwinds past the read,
    // so whatever it saw has to already be somewhere the assertion can reach.
    const seenDuringRefusal: number[] = [];
    expect(() =>
      stores.ledger.replica.db.transaction((tx) => {
        try {
          setTransactionLinesExecutor.apply(
            {
              transactionId: TXN,
              version: readTxn()?.version ?? 0,
              // `apply` takes the schema's *output*, so the money is already
              // `Money` here — `writeLocally` above is what parses a string
              // into one, and this call deliberately steps around it.
              lines: [
                { id: LINE, description: "Espresso", amount: toMoney("18"), categoryId: ARCHIVED },
              ],
            },
            tx,
            capture,
          );
        } finally {
          seenDuringRefusal.push(
            tx.select().from(transactionLines).where(eq(transactionLines.transactionId, TXN)).all()
              .length,
          );
        }
      }),
    ).toThrow(/set_transaction_lines.*category_id.*archived/s);

    expect(
      seenDuringRefusal,
      "the old set was still on the table when the refusal was thrown — the check runs above the delete",
    ).toEqual([1]);
  });

  /**
   * Broken once, on the other table: no executor in the way, the write aimed
   * straight at `transaction_lines` the way a future op with no such check
   * would. SQLite refuses it.
   */
  it("the replica itself refuses a line insert onto it", () => {
    expect(() =>
      stores.ledger.replica.db
        .insert(transactionLines)
        .values({
          id: id<"transactionLines">("00000000-0000-4000-8000-0000000000b2"),
          transactionId: TXN,
          description: "Espresso",
          amount: toMoney("18"),
          sort: 0,
          categoryId: ARCHIVED,
        })
        .run(),
    ).toThrow(/archived/i);
  });

  it("the replica itself refuses a line update onto it", () => {
    const LINE = id<"transactionLines">("00000000-0000-4000-8000-0000000000b3");
    stores.ledger.replica.db
      .insert(transactionLines)
      .values({
        id: LINE,
        transactionId: TXN,
        description: "Espresso",
        amount: toMoney("18"),
        sort: 0,
      })
      .run();

    expect(() =>
      stores.ledger.replica.db
        .update(transactionLines)
        .set({ categoryId: ARCHIVED })
        .where(eq(transactionLines.id, LINE))
        .run(),
    ).toThrow(/archived/i);
    expect(
      stores.ledger.replica.db
        .select()
        .from(transactionLines)
        .where(eq(transactionLines.id, LINE))
        .get()?.categoryId,
    ).toBeNull();
  });

  /**
   * M2 — the bulk path. The trigger below would abort the `UPDATE` anyway;
   * what the executor adds is a refusal that names `categorize_batch` and
   * `category_id` rather than one arriving from inside a statement touching
   * N rows at once.
   */
  it("categorize_batch refuses before the bulk write, naming the operation and the field", () => {
    expect(() =>
      writeLocally(stores.ledger, {
        executor: categorizeBatchExecutor,
        registry: ledgerRegistry,
        capture,
        input: { transactionIds: [TXN], categoryId: ARCHIVED },
      }),
    ).toThrow(/categorize_batch.*category_id.*archived/s);
    expect(readTxn()?.categoryId, "no row was touched").toBeNull();
  });
});
