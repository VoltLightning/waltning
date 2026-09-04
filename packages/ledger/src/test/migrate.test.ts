/**
 * The migrators, tested on the two properties that have no second chance.
 *
 * **Nothing here is mocked below the database.** These run on real
 * `better-sqlite3` files in a real temporary directory, with a real filesystem
 * doing the copying — because every property under test is about what survives
 * a process that stopped: a transaction that rolled back, a version that did
 * not move, a copy that was taken before the first write. A fake database would
 * report success on all three.
 *
 * Temp files rather than `test/scratch.ts`'s `:memory:`, for one reason: the
 * pre-migration copy is a *file* copy, and `:memory:` has no file to copy.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import Database from "better-sqlite3";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPLICA_REBUILDS } from "../ddl.ts";
import {
  advanceAppliedSeq,
  COPY_SUFFIX,
  type LedgerFs,
  type Migration,
  migrateOutbox,
  migrateReplica,
  OUTBOX_MIGRATIONS,
  REPLICA_MIGRATIONS,
  readAppliedSeq,
} from "../migrate.ts";
import { openLedger } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

const { accounts, currencies, outbox, transactions, transactionLines } = schema;
const outboxSchema = { outbox: schema.outbox, outboxSeq: schema.outboxSeq };
const replicaSchema = {
  accountGroups: schema.accountGroups,
  accounts: schema.accounts,
  categories: schema.categories,
  counterparties: schema.counterparties,
  counterpartyDistinctPairs: schema.counterpartyDistinctPairs,
  counterpartyMerges: schema.counterpartyMerges,
  currencies: schema.currencies,
  dashboardLayouts: schema.dashboardLayouts,
  dashboardWidgets: schema.dashboardWidgets,
  fxRates: schema.fxRates,
  localMeta: schema.localMeta,
  recurringTransactions: schema.recurringTransactions,
  tags: schema.tags,
  transactionLines: schema.transactionLines,
  transactions: schema.transactions,
  transactionTags: schema.transactionTags,
};

/* ── the harness ─────────────────────────────────────────────────────────── */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "waltning-ledger-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The real thing. The copy has to be a file on disk or the test proves nothing. */
const realFs: LedgerFs = {
  exists: (path) => existsSync(path),
  copy: (from, to) => copyFileSync(from, to),
  remove: (path) => rmSync(path, { force: true }),
};

/**
 * `better-sqlite3` in the shape `openLedger` asks for.
 *
 * This *is* the driver injection working: the device passes an `expo-sqlite`
 * version of these six lines and `packages/ledger` names neither package.
 */
function openAt(name: string) {
  return openLedger(
    (filename: string) => {
      const sqlite = new Database(filename);
      return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
    },
    { replica: join(dir, `${name}-replica.db`), outbox: join(dir, `${name}-outbox.db`) },
  );
}

type Ledger = ReturnType<typeof openAt>;

/** Read a database's own view of itself, through a handle the code under test never had. */
function inspect<T>(path: string, read: (db: Database.Database) => T): T {
  const sqlite = new Database(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

function userVersion(db: Database.Database): number {
  const row = db.prepare("pragma user_version").get() as { user_version: number };
  return row.user_version;
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
}

/**
 * The rows a transaction points at.
 *
 * **New, and it is the whole point of this change showing up in the harness.**
 * The old runtime emitter dropped foreign keys, so a transaction naming an
 * account that was never inserted landed cleanly; the generated DDL carries
 * them and `open.ts` has `pragma foreign_keys` on for the replica, so it does
 * not. No expectation below changed — the database started refusing what it had
 * been declaring all along, which is §14.6's *"a bad row is rejected while the
 * person who typed it is still looking at it"*.
 *
 * `onConflictDoNothing` because a test that seeds two transactions seeds these
 * twice.
 */
function seedReferences(ledger: Ledger) {
  ledger.replica.db
    .insert(currencies)
    .values({ code: currencyCode("PLN"), name: "Placeholder" })
    .onConflictDoNothing()
    .run();
  ledger.replica.db
    .insert(accounts)
    .values({
      id: id<"accounts">("acc-1"),
      name: "Bank A · PLN",
      currency: currencyCode("PLN"),
    })
    .onConflictDoNothing()
    .run();
}

/** A row, so "the tables are untouched" can be about contents and not only names. */
function seedTransaction(ledger: Ledger, txnId: string) {
  seedReferences(ledger);
  ledger.replica.db
    .insert(transactions)
    .values({
      id: id<"transactions">(txnId) as Id<"transactions">,
      date: accountingDate("2026-03-12"),
      type: "expense",
      accountId: id<"accounts">("acc-1"),
      amountOriginal: money.toMoney("18.00"),
      currency: currencyCode("PLN"),
      fxRate: money.pivotPerUnit("1.000000000000"),
    })
    .run();
}

function transactionCount(db: Database.Database): number {
  const row = db.prepare("select count(*) as n from transactions").get() as { n: number };
  return row.n;
}

/**
 * An outbox entry, inserted through drizzle rather than as raw SQL.
 *
 * The generated DDL does carry the column defaults now, but drizzle also fills
 * in the `$defaultFn` ones — `deps`, `captured_at` — which live in JavaScript
 * and never reach SQLite. A hand-written `insert` would have to name every one
 * of those and would break the next time the outbox gains another. That is a
 * property of this test, not of the table.
 */
function seedEntry(ledger: Ledger, entryId: string) {
  ledger.outbox.db
    .insert(outbox)
    .values({
      id: entryId,
      seq: 1,
      operation: "create_transaction",
      opVersion: 1,
      payload: {},
      capturedTz: "Europe/Warsaw",
      capturedOffsetMinutes: 120,
    })
    .run();
}

/**
 * Real version 1 alone, never `REPLICA_MIGRATIONS` itself: `REPLICA_MIGRATIONS`
 * carries a real version 2 now (M2), and `chainOfTwo` below synthesises its
 * own — appending onto the real chain would collide on the version number,
 * and `checkChain` would refuse it before any test here got the chance to run.
 */
const REPLICA_V1: readonly Migration[] = REPLICA_MIGRATIONS.filter((m) => m.version === 1);

/** A second version, which either creates a table or dies trying. */
function chainOfTwo(base: readonly Migration[], second: "creates" | "throws"): Migration[] {
  return [
    ...base,
    {
      version: 2,
      up: (tx) => {
        if (second === "throws") throw new Error("killed mid-migration");
        tx.run(sql.raw('create table "v2_marker" ("a" integer)'));
      },
    },
  ];
}

/* ── a fresh database ────────────────────────────────────────────────────── */

describe("a fresh database", () => {
  it("migrates the replica to current and says so in `user_version`", () => {
    const ledger = openAt("fresh");
    const result = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });
    ledger.close();

    expect(result.from).toBe(0);
    // Two versions now (M2) — a fresh database runs both, version 1's create
    // and version 2's rebuild, in the same launch.
    expect(result.to).toBe(2);
    expect(result.applied).toEqual([1, 2]);
    expect(result.refetchRequired, "nothing was dropped — there was nothing there").toBe(false);

    const names = inspect(join(dir, "fresh-replica.db"), tableNames);
    expect(names, "the fifteen shared tables plus the replica's meta store").toHaveLength(16);
    expect(names).toContain("transactions");
    expect(names).toContain("local_meta");
    expect(names, "the outbox is the other file's table").not.toContain("outbox");

    expect(inspect(join(dir, "fresh-replica.db"), userVersion)).toBe(2);
  });

  it("migrates the outbox, and only the outbox, into the second file", () => {
    const ledger = openAt("fresh");
    const result = migrateOutbox(ledger.outbox, { fs: realFs });
    ledger.close();

    expect(result.applied).toEqual([1]);
    expect(inspect(join(dir, "fresh-outbox.db"), tableNames)).toEqual(["outbox", "outbox_seq"]);
    expect(inspect(join(dir, "fresh-outbox.db"), userVersion)).toBe(1);
  });

  it("is a no-op the second time", () => {
    const ledger = openAt("twice");

    const first = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });
    // Release it, so what the second run reports is about the second run.
    first.copy?.release();

    const second = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });
    ledger.close();

    expect(second.from).toBe(2);
    expect(second.to).toBe(2);
    expect(second.applied, "no step ran again").toEqual([]);
    expect(second.copy, "and nothing was copied, because nothing was written").toBeNull();
  });

  it("hands back an unreleased copy even when there is nothing to migrate", () => {
    const ledger = openAt("outstanding");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });

    // The app migrated and then never opened cleanly. On the next launch there
    // is nothing to do — but the copy is still the record of that, and the
    // caller needs it back to release it once the app finally does open.
    const second = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });
    ledger.close();

    expect(second.applied).toEqual([]);
    expect(second.copy?.path).toBe(join(dir, "outstanding-replica.db") + COPY_SUFFIX);
  });
});

/* ── one transaction, or none of it ──────────────────────────────────────── */

describe("a migration that throws leaves nothing behind", () => {
  /**
   * **The property the whole module rests on.** `PRAGMA user_version` is in the
   * database header and rolls back with everything else, which is what makes
   * "half-migrated" unrepresentable — and what stops the *next* launch from
   * believing a migration ran that did not.
   */
  it("leaves `user_version` and the tables exactly as they were, on the outbox", () => {
    const ledger = openAt("rollback");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
    seedEntry(ledger, "e-1");

    expect(() =>
      migrateOutbox(ledger.outbox, {
        fs: realFs,
        migrations: chainOfTwo(OUTBOX_MIGRATIONS, "throws"),
      }),
    ).toThrow("killed mid-migration");
    ledger.close();

    const path = join(dir, "rollback-outbox.db");
    expect(inspect(path, userVersion), "still at 1 — the bump is inside the transaction").toBe(1);
    expect(inspect(path, tableNames), "v2 created nothing that survived").toEqual([
      "outbox",
      "outbox_seq",
    ]);
    expect(
      inspect(path, (db) => db.prepare("select count(*) as n from outbox").get()),
      "and the entries are untouched",
    ).toEqual({ n: 1 });
  });

  /**
   * The same property over the destructive path, which is where it matters
   * most: the drop and the recreate are steps in one transaction, so a failure
   * anywhere in the chain leaves the ledger as it was rather than empty.
   */
  it("does not leave the replica dropped when a later step fails", () => {
    const ledger = openAt("rollback-drop");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    seedTransaction(ledger, "txn-1");

    expect(() =>
      migrateReplica(ledger.replica, {
        fs: realFs,
        canRefetch: true,
        migrations: chainOfTwo(REPLICA_V1, "throws"),
      }),
    ).toThrow("killed mid-migration");
    ledger.close();

    const path = join(dir, "rollback-drop-replica.db");
    expect(inspect(path, userVersion)).toBe(1);
    expect(inspect(path, transactionCount), "the drop rolled back with everything else").toBe(1);
  });
});

/* ── the outbox is never dropped ─────────────────────────────────────────── */

describe("the outbox is never dropped", () => {
  /**
   * `architecture/08` §5, one word: **"Never drop."** The entries in this file
   * are the only copy of intentions nobody has been told about. A version this
   * build does not understand is a reason to stop, never a reason to reset.
   */
  it("refuses a version ahead of this build, and keeps the entries", () => {
    const ledger = openAt("ahead");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
    seedEntry(ledger, "e-1");
    // A build from the future wrote this file and moved on.
    ledger.outbox.db.run(sql.raw("pragma user_version = 9"));

    expect(() => migrateOutbox(ledger.outbox, { fs: realFs })).toThrow(/never dropped/);
    ledger.close();

    const path = join(dir, "ahead-outbox.db");
    expect(inspect(path, userVersion), "untouched").toBe(9);
    expect(
      inspect(path, (db) => db.prepare("select id from outbox").all()),
      "the entry is still there — this is the file that has no second copy",
    ).toEqual([{ id: "e-1" }]);
    expect(existsSync(path + COPY_SUFFIX), "and nothing was even copied").toBe(false);
  });

  it("refuses a version that is not in this build's chain", () => {
    const ledger = openAt("gap");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
    ledger.outbox.db.run(sql.raw("pragma user_version = 2"));

    // Chain [1, 3]: version 2 was written by a build whose migration this one
    // does not have, so "the steps after 2" is a guess.
    const chain: Migration[] = [
      ...OUTBOX_MIGRATIONS,
      { version: 3, up: (tx) => tx.run(sql.raw('create table "v3" ("a" integer)')) },
    ];

    expect(() => migrateOutbox(ledger.outbox, { fs: realFs, migrations: chain })).toThrow(
      /never a reset/,
    );
    ledger.close();

    expect(inspect(join(dir, "gap-outbox.db"), tableNames)).toEqual(["outbox", "outbox_seq"]);
  });
});

/* ── With no backend, there is nothing to refetch from ──────────────────── */

describe("the replica is not dropped when there is nowhere to refetch from", () => {
  /**
   * **The carve-out, and the sharpest edge in the module.** §08 says a replica
   * version mismatch means drop and refetch. §14.1 says that with no backend
   * there is no server — *"with no server the outbox never drains"* — so the
   * replica is not a copy of anything, and §14.6 says a migration must not be
   * able to destroy the ledger. Dropping here is not a refetch; it is the
   * deletion of the record.
   */
  it("raises instead, and leaves every row where it was", () => {
    const ledger = openAt("brick1");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    seedTransaction(ledger, "txn-1");
    seedTransaction(ledger, "txn-2");

    expect(() =>
      migrateReplica(ledger.replica, {
        fs: realFs,
        canRefetch: false,
        migrations: chainOfTwo(REPLICA_V1, "creates"),
      }),
    ).toThrow(/nothing to refetch from/);
    ledger.close();

    const path = join(dir, "brick1-replica.db");
    expect(inspect(path, transactionCount), "the ledger is still the ledger").toBe(2);
    expect(inspect(path, userVersion), "and it was not migrated either").toBe(1);
    expect(
      existsSync(path + COPY_SUFFIX),
      "nothing was written at all — not even the copy that precedes writing",
    ).toBe(false);
  });

  /** The same mismatch, once a backend exists, is the ordinary drop-and-refetch. */
  it("drops once a backend has been reached, and says a refetch is required", () => {
    const ledger = openAt("brick2");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    seedTransaction(ledger, "txn-1");

    const result = migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: true,
      migrations: chainOfTwo(REPLICA_V1, "creates"),
    });
    ledger.close();

    expect(result.refetchRequired).toBe(true);
    expect(result.to).toBe(2);

    const path = join(dir, "brick2-replica.db");
    expect(inspect(path, transactionCount), "emptied — the server holds these rows").toBe(0);
    expect(inspect(path, tableNames)).toContain("v2_marker");
  });
});

/* ── a versioned rebuild reaches an installed replica (M2) ───────────────── */

describe("an in-place rebuild migrates a phone already at version 1", () => {
  /**
   * The whole point of M2: version 2 rebuilds `transactions` to add
   * `transactions_debt_amount_requires_currency` without the drop-and-refetch
   * rule ever engaging — proven with `canRefetch: false`, the exact
   * offline-only phone the single-version chain used to strand at version 1
   * forever.
   */
  it("migrates a v1 database to v2 with every row intact, and ships the CHECK", () => {
    const ledger = openAt("inplace");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    seedTransaction(ledger, "txn-1");
    // A child row too (`ON DELETE CASCADE` on `transaction_lines.transaction_id`)
    // — the row a naive copy-rename-drop of `transactions`, run with foreign
    // keys still enforced, would cascade away even though nothing asked it to.
    ledger.replica.db
      .insert(transactionLines)
      .values({
        id: id<"transactionLines">("line-1"),
        transactionId: id<"transactions">("txn-1") as Id<"transactions">,
        description: "Room",
        amount: money.toMoney("18.00"),
      })
      .run();

    // The real chain, not a synthetic one — and no `canRefetch` needed.
    const result = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });

    expect(result.from).toBe(1);
    expect(result.to).toBe(2);
    expect(result.applied, "only the step after `found` ran").toEqual([2]);
    expect(result.refetchRequired, "nothing was dropped").toBe(false);

    let cause: unknown;
    try {
      ledger.replica.db
        .insert(transactions)
        .values({
          id: id<"transactions">("txn-check") as Id<"transactions">,
          date: accountingDate("2026-03-13"),
          type: "expense",
          accountId: id<"accounts">("acc-1"),
          amountOriginal: money.toMoney("5.00"),
          currency: currencyCode("PLN"),
          fxRate: money.pivotPerUnit("1.000000000000"),
          debtAmount: money.toMoney("5.00"),
        })
        .run();
    } catch (error) {
      // `.cause` when drizzle wrapped the driver error, the error itself when
      // (as here, a plain `.run()`) it did not — `refusal` below makes the
      // same allowance.
      cause = error instanceof Error ? (error.cause ?? error) : error;
    }
    expect(String(cause), "the rebuilt table enforces the CHECK").toMatch(
      /CHECK constraint failed/i,
    );
    ledger.close();

    const path = join(dir, "inplace-replica.db");
    expect(inspect(path, userVersion)).toBe(2);
    expect(
      inspect(path, transactionCount),
      "the transaction survived its own table's rebuild",
    ).toBe(1);
    expect(
      inspect(path, (db) => db.prepare("select count(*) as n from transaction_lines").get()),
      "and so did the child row `ON DELETE CASCADE` could otherwise have taken with it",
    ).toEqual({ n: 1 });
  });

  /**
   * M2's other half. `embed-ddl.ts` derives `REPLICA_REBUILDS`' keys straight
   * from `drizzle/replica`'s rebuild files, and `REPLICA_MIGRATIONS` is meant
   * to run every one of them by tag (`rebuildTag`) — but nothing stops a
   * chain entry from going in without its rebuild, or a rebuild file landing
   * with no step naming it, and either way the rebuild never reaches an
   * installed phone. This is the mechanical check for that, over the real
   * exports rather than a synthetic chain.
   */
  it("gives every REPLICA_REBUILDS tag a REPLICA_MIGRATIONS entry that runs it", () => {
    const tags = Object.keys(REPLICA_REBUILDS);
    expect(tags.length, "vacuity guard — this repo has at least one rebuild file").toBeGreaterThan(
      0,
    );

    const referenced = new Set(
      REPLICA_MIGRATIONS.flatMap((m) => (m.rebuildTag === undefined ? [] : [m.rebuildTag])),
    );
    expect(
      referenced,
      "a rebuild file nobody's chain runs never reaches an installed phone",
    ).toEqual(new Set(tags));
  });
});

/* ── the pre-migration copy ──────────────────────────────────────────────── */

describe("the pre-migration copy", () => {
  it("fully consumes result-bearing pragmas before copying under Expo SQLite", () => {
    const ledger = openAt("expo-pragmas");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();

    const get = vi.spyOn(ledger.outbox.db, "get").mockImplementation(() => {
      throw new Error("Expo SQLite would leave the first result row active");
    });
    const run = vi.spyOn(ledger.outbox.db, "run").mockImplementation(() => {
      throw new Error("Expo SQLite would leave the checkpoint result row active");
    });
    const all = vi.spyOn(ledger.outbox.db, "all");

    const result = migrateOutbox(ledger.outbox, {
      fs: realFs,
      migrations: chainOfTwo(OUTBOX_MIGRATIONS, "creates"),
    });

    expect(get).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(2);
    result.copy?.release();
    ledger.close();
  });

  /**
   * §14.6: *"a transaction alone covers an error; it does not cover a crash, a
   * kill, or a corrupt write."* So the copy has to be taken **before** the
   * first write, and the way to prove that is to look at the database at the
   * moment the copy is requested rather than to trust the ordering in the
   * source.
   */
  it("is taken before anything is written, and holds the state as it was", () => {
    const ledger = openAt("copy");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    seedTransaction(ledger, "txn-1");

    const path = join(dir, "copy-replica.db");
    const atCopyTime: { version: number; rows: number }[] = [];
    const watchingFs: LedgerFs = {
      ...realFs,
      copy: (from, to) => {
        atCopyTime.push({
          version: inspect(from, userVersion),
          rows: inspect(from, transactionCount),
        });
        realFs.copy(from, to);
      },
    };

    const result = migrateReplica(ledger.replica, {
      fs: watchingFs,
      canRefetch: true,
      migrations: chainOfTwo(REPLICA_V1, "creates"),
    });
    ledger.close();

    expect(atCopyTime, "copied exactly once").toHaveLength(1);
    expect(
      atCopyTime[0],
      "the database was still at version 1 with its row when the copy was taken",
    ).toEqual({ version: 1, rows: 1 });

    // And the file on disk is that state, not a checkpoint-stale version of it:
    // WAL keeps recent commits in the `-wal` sibling until they are folded back,
    // so a copy taken without a checkpoint would be missing the seeded row.
    const copyPath = `${path}${COPY_SUFFIX}`;
    expect(result.copy?.path).toBe(copyPath);
    expect(inspect(copyPath, userVersion)).toBe(1);
    expect(inspect(copyPath, transactionCount), "the row that was there a moment ago").toBe(1);

    // The live database has moved on, which is what makes the copy worth having.
    expect(inspect(path, transactionCount)).toBe(0);
  });

  it("is retained until it is explicitly released", () => {
    const ledger = openAt("retain");
    const result = migrateReplica(ledger.replica, { fs: realFs, canRefetch: false });
    ledger.close();

    const copyPath = join(dir, "retain-replica.db") + COPY_SUFFIX;
    expect(existsSync(copyPath), "kept — the app has not opened cleanly yet").toBe(true);

    result.copy?.release();
    expect(existsSync(copyPath), "and gone once the caller says it has").toBe(false);
  });

  /**
   * A copy still sitting there says the app never opened cleanly after the
   * migration that took it — which puts the live file under suspicion. Writing
   * over it would destroy the good copy at the moment it is most likely to be
   * needed.
   */
  it("refuses to migrate over a copy nobody released", () => {
    const ledger = openAt("stale");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false, migrations: REPLICA_V1 });

    expect(() =>
      migrateReplica(ledger.replica, {
        fs: realFs,
        canRefetch: true,
        migrations: chainOfTwo(REPLICA_V1, "creates"),
      }),
    ).toThrow(/has not opened cleanly/);
    ledger.close();

    expect(inspect(join(dir, "stale-replica.db"), userVersion)).toBe(1);
  });
});

/* ── the watermark ───────────────────────────────────────────────────────── */

describe("`applied_seq`, the replica's watermark", () => {
  it("starts at zero and is one row, by constraint and not by convention", () => {
    const ledger = openAt("meta");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();

    expect(readAppliedSeq(ledger.replica.db)).toBe(0);

    // The `CHECK` is what makes "one row" true when the code that inserts is
    // wrong, which `CLAUDE.md` asks of every guarantee. Asserted on the cause
    // rather than the message: drizzle wraps a driver error in its own, so a
    // bare `toThrow()` here would pass on a typo in the table name.
    let cause: unknown;
    try {
      ledger.replica.db.run(sql.raw(`insert into "local_meta" ("id") values (2)`));
    } catch (error) {
      cause = error instanceof Error ? error.cause : error;
    }
    expect(String(cause), "SQLite refused it, not the code").toMatch(/CHECK constraint failed/i);

    expect(
      ledger.replica.db.get<{ n: number }>(sql.raw(`select count(*) as n from "local_meta"`)),
    ).toEqual({ n: 1 });
    ledger.close();
  });

  /**
   * **Why it lives in the replica.** The two stores are two files and WAL gives
   * no atomicity across them, so the watermark is only meaningful if it commits
   * with the row it describes. That is a claim about a transaction, so it is
   * tested by rolling one back.
   */
  it("advances inside the caller's transaction, and rolls back with it", () => {
    const ledger = openAt("watermark");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();

    ledger.replica.db.transaction((tx) => {
      seedTransaction(ledger, "txn-1");
      advanceAppliedSeq(tx, 7);
    });
    expect(readAppliedSeq(ledger.replica.db)).toBe(7);

    expect(() =>
      ledger.replica.db.transaction((tx) => {
        advanceAppliedSeq(tx, 9);
        throw new Error("killed mid-capture");
      }),
    ).toThrow("killed mid-capture");

    expect(
      readAppliedSeq(ledger.replica.db),
      "a watermark that survived its own transaction would claim an effect the tables do not hold",
    ).toBe(7);
    ledger.close();
  });

  it("never goes backwards", () => {
    const ledger = openAt("monotonic");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();

    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 12));
    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 4));

    expect(readAppliedSeq(ledger.replica.db), "a rewind would re-apply settled entries").toBe(12);
    ledger.close();
  });

  /**
   * A drop takes the watermark with it and the chain recreates it at zero,
   * which is both correct and the safe direction: a refetched replica holds
   * what the *server* admitted, so every entry still in the outbox is by
   * definition not reflected in it and must be replayed.
   */
  it("resets to zero when the replica is dropped and refetched", () => {
    const ledger = openAt("reset");
    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 31));

    migrateReplica(ledger.replica, {
      fs: realFs,
      canRefetch: true,
      migrations: chainOfTwo(REPLICA_V1, "creates"),
    });

    expect(readAppliedSeq(ledger.replica.db)).toBe(0);
    ledger.close();
  });
});

/* ── what the schema declares reaches the device ─────────────────────────── */

/**
 * **The card's whole reason, tested rather than asserted in a comment.**
 *
 * The migrator used to build its DDL at run time by walking drizzle's table
 * objects — columns, affinities, `primary key`, `not null`, and nothing else.
 * Foreign keys, `CHECK`s, indexes and partial unique indexes were dropped
 * silently on the way to the device, which is worse than never declaring them:
 * `outbox.ts` declares `index("outbox_pending_by_seq")` and reasons about the
 * drain's read against it, `open.ts` turns `pragma foreign_keys` on for the
 * replica, and §14.6 requires the phone to *"reject a bad row while the person
 * who typed it is still looking at it"* — every one of those read as enforced
 * and none of them was.
 *
 * So each of these reads the guarantee back **out of the database**: out of
 * `sqlite_master`, or by provoking the refusal. Trusting the generator is what
 * the old emitter's comment did.
 */
describe("a constraint declared in the schema is present on the device", () => {
  /** Every object of a kind, as the file itself reports them. */
  function objects(db: Database.Database, type: "index" | "table"): string[] {
    return db
      .prepare("select name from sqlite_master where type = ? and name not like 'sqlite_%'")
      .all(type)
      .map((row) => (row as { name: string }).name)
      .sort();
  }

  /**
   * The cause, not the wrapper. Drizzle wraps a driver error in its own, so a
   * bare `toThrow(/…/)` here passes on a typo in a table name.
   */
  function refusal(attempt: () => void): string {
    try {
      attempt();
    } catch (error) {
      // `catch` bindings are `unknown` because the language gives no choice.
      return String(error instanceof Error ? (error.cause ?? error) : error);
    }
    throw new Error("nothing was refused — the constraint is not on the device");
  }

  it("ships the outbox's index, which the old emitter dropped", () => {
    const ledger = openAt("index");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
    ledger.close();

    expect(
      inspect(join(dir, "index-outbox.db"), (db) => objects(db, "index")),
      "`outbox.ts` declares it and the drain's only read is planned against it",
    ).toEqual(
      // R4 C2 adds `outbox_deferred`, `recover.ts`'s `outstanding` query's
      // own index — sqlite_master lists them alphabetically, ahead of the
      // pre-existing `outbox_pending_by_seq`.
      ["outbox_deferred", "outbox_pending_by_seq"],
    );
  });

  /**
   * `local_meta`'s `check ("id" = 1)` used to survive only because it was
   * written as literal DDL inside the migrator, beside a comment explaining
   * that a drizzle definition would state the check and then not ship it. It is
   * an ordinary `check()` in `local-meta.ts` now, and this is what says so.
   */
  it("enforces a `CHECK` the schema declares, against a raw insert", () => {
    const ledger = openAt("check");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();

    const cause = refusal(() =>
      ledger.replica.db.run(sql.raw(`insert into "local_meta" ("id") values (2)`)),
    );
    expect(cause, "SQLite refused it, not the code").toMatch(/CHECK constraint failed/i);
    ledger.close();
  });

  /**
   * The refusal §14.6 actually asks for: a capture naming a row that is not
   * there. `open.ts` has had `pragma foreign_keys` on for the replica since it
   * was written, against a file that declared no references for it to enforce.
   */
  it("enforces a foreign key, so a capture naming a missing row is refused", () => {
    const ledger = openAt("fk");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();
    seedReferences(ledger);

    const cause = refusal(() =>
      ledger.replica.db
        .insert(transactions)
        .values({
          id: id<"transactions">("txn-orphan") as Id<"transactions">,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: id<"accounts">("no-such-account"),
          amountOriginal: money.toMoney("18.00"),
          currency: currencyCode("PLN"),
          fxRate: money.pivotPerUnit("1.000000000000"),
        })
        .run(),
    );
    expect(cause).toMatch(/FOREIGN KEY constraint failed/i);
    ledger.close();
  });

  /**
   * **The staleness guard, and the one thing generated-and-committed DDL is
   * exposed to that a runtime emitter was not.**
   *
   * `ddl.ts` is output: it is only correct as long as somebody ran `pnpm
   * ledger:generate` after touching a table. A fourteenth shared table added to
   * `packages/schema` without regenerating would compile, query cleanly against
   * a scratch database drizzle built from the same objects, and be missing from
   * the phone. Comparing the migrated file against the schema modules the
   * generator reads is what turns that from silent into red.
   *
   * It compares **against the schema, not against the `.sql` on disk**. The
   * `.sql` and `ddl.ts` are written by one script in one step, so they only
   * disagree if somebody hand-edited either — while "changed a table and
   * forgot to regenerate" is the mistake anyone will actually make.
   *
   * It is also what keeps the two databases apart: `outbox` in the replica's
   * DDL would pass a count and fail this.
   */
  it("creates exactly the tables its schema module declares, in each database", () => {
    const ledger = openAt("drift");
    migrateReplica(ledger.replica, { fs: realFs, canRefetch: false }).copy?.release();
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
    ledger.close();

    type SchemaModule = Record<string, Parameters<typeof getTableName>[0]>;
    const declared = (module: SchemaModule) => Object.values(module).map(getTableName).sort();

    /**
     * Columns too, not only table names. A column added to a shared table
     * without regenerating is the likelier miss — nothing about it changes the
     * table list, drizzle happily builds a `select` naming it, and the phone
     * gets `no such column` on the first read.
     */
    const declaredColumns = (module: SchemaModule) =>
      Object.values(module)
        .flatMap((table) =>
          Object.values(getTableColumns(table)).map((c) => `${getTableName(table)}.${c.name}`),
        )
        .sort();

    const shipped = (path: string) =>
      inspect(path, (db) =>
        objects(db, "table")
          .flatMap((name) =>
            db
              .prepare(`select name from pragma_table_info(?)`)
              .all(name)
              .map((row) => `${name}.${(row as { name: string }).name}`),
          )
          .sort(),
      );

    expect(declared(replicaSchema), "vacuity guard").toHaveLength(16);
    expect(declaredColumns(replicaSchema).length, "vacuity guard").toBeGreaterThan(100);

    expect(
      inspect(join(dir, "drift-replica.db"), (db) => objects(db, "table")),
      "regenerate with `pnpm ledger:generate` after changing a table",
    ).toEqual(declared(replicaSchema));
    expect(shipped(join(dir, "drift-replica.db"))).toEqual(declaredColumns(replicaSchema));

    expect(
      inspect(join(dir, "drift-outbox.db"), (db) => objects(db, "table")),
      "and the outbox file holds the outbox's two, and nothing else",
    ).toEqual(declared(outboxSchema));
    expect(shipped(join(dir, "drift-outbox.db"))).toEqual(declaredColumns(outboxSchema));
  });

  /**
   * **H1's own regression net.** A table rebuild's `DROP TABLE` drops every
   * index declared against it, and nothing declares anything against the
   * `__new_<table>` copy that replaces it — so a rebuild that does not
   * explicitly recreate them ships a table with none. Checked over both
   * paths a real phone can take: a **fresh** install, where the whole chain
   * (including the rebuild) runs once against a blank database, and
   * **v1→v2**, where the rebuild runs in place against a database that
   * already has version 1's indexes — the path an already-installed phone
   * takes, and the one a fix that only worked on a blank database would
   * still fail.
   */
  it("keeps every index its schema module declares, fresh and after an in-place rebuild (H1)", () => {
    type IndexedSchemaModule = Record<string, Parameters<typeof getTableConfig>[0]>;
    const declaredIndexes = (module: IndexedSchemaModule) =>
      Object.values(module)
        .flatMap((table) => getTableConfig(table).indexes.map((index) => index.config.name))
        .sort();

    // Vacuity guard — this is meaningless if the replica schema declares no
    // indexes, and it does (`counterparties_name_uq`, `fx_rates_pk`).
    expect(declaredIndexes(replicaSchema).length, "vacuity guard").toBeGreaterThan(0);

    const fresh = openAt("index-fresh");
    migrateReplica(fresh.replica, { fs: realFs, canRefetch: false }).copy?.release();
    fresh.close();
    expect(
      inspect(join(dir, "index-fresh-replica.db"), (db) => objects(db, "index")),
      "fresh install — the whole chain, rebuild included, ran once",
    ).toEqual(declaredIndexes(replicaSchema));

    const v1v2 = openAt("index-v1v2");
    migrateReplica(v1v2.replica, {
      fs: realFs,
      canRefetch: false,
      migrations: REPLICA_V1,
    }).copy?.release();
    migrateReplica(v1v2.replica, { fs: realFs, canRefetch: false }).copy?.release();
    v1v2.close();
    expect(
      inspect(join(dir, "index-v1v2-replica.db"), (db) => objects(db, "index")),
      "v1→v2 — the rebuild ran in place against a database version 1 had already indexed",
    ).toEqual(declaredIndexes(replicaSchema));
  });
});

/* ── opening ─────────────────────────────────────────────────────────────── */

describe("opening the pair", () => {
  it("refuses to point both stores at one file", () => {
    const path = join(dir, "one.db");
    expect(() =>
      openLedger(
        (filename: string) => {
          const sqlite = new Database(filename);
          return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
        },
        { replica: path, outbox: path },
      ),
    ).toThrow(/separate files/);
  });

  it("puts both files in WAL and turns foreign keys on for the replica only", () => {
    const ledger = openAt("pragmas");

    // The union is not tidiness. Written as `typeof ledger.replica.db` this
    // helper refuses the outbox handle and the compiler says so — the brand
    // working, on the first accidental swap anyone made.
    const read = (db: typeof ledger.replica.db | typeof ledger.outbox.db, pragma: string) =>
      db.get<Record<string, unknown>>(sql.raw(`pragma ${pragma}`));

    expect(read(ledger.replica.db, "journal_mode")).toEqual({ journal_mode: "wal" });
    expect(read(ledger.outbox.db, "journal_mode")).toEqual({ journal_mode: "wal" });

    expect(read(ledger.replica.db, "foreign_keys"), "§14.6 — refuse at capture time").toEqual({
      foreign_keys: 1,
    });
    expect(
      read(ledger.outbox.db, "foreign_keys"),
      "the outbox has no references: its payload is opaque by design",
    ).toEqual({ foreign_keys: 0 });

    expect(read(ledger.replica.db, "busy_timeout")).toEqual({ timeout: 5000 });
    ledger.close();
  });

  /**
   * The browser's declaration: no WAL on offer, verified rather than assumed.
   * `open.ts` carries why the two WAL properties are not needed there.
   */
  it("accepts a platform that declares rollback, and leaves the files out of WAL", () => {
    const ledger = openLedger(
      (filename: string) => {
        const sqlite = new Database(filename);
        return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
      },
      { replica: join(dir, "rb-replica.db"), outbox: join(dir, "rb-outbox.db") },
      { journalMode: "rollback" },
    );

    const journal = ledger.replica.db.get<{ journal_mode: string }>(sql.raw("pragma journal_mode"));
    expect(journal?.journal_mode).not.toBe("wal");
    // The rest of the tuning still applies — the declaration changes one pragma.
    expect(ledger.replica.db.get<{ foreign_keys: number }>(sql.raw("pragma foreign_keys"))).toEqual(
      { foreign_keys: 1 },
    );
    ledger.close();
  });

  it("refuses the rollback declaration over a file that is already in WAL", () => {
    // A previous run put the file in WAL — the mode is stored in the file.
    const path = join(dir, "was-wal-replica.db");
    const prior = new Database(path);
    prior.pragma("journal_mode = WAL");
    prior.close();

    expect(() =>
      openLedger(
        (filename: string) => {
          const sqlite = new Database(filename);
          return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
        },
        { replica: path, outbox: join(dir, "was-wal-outbox.db") },
        { journalMode: "rollback" },
      ),
    ).toThrow(/declared journalMode "rollback"/);
  });
});
