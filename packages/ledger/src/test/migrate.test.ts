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
import { fold } from "@waltning/core/capture/names";
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import Database from "better-sqlite3";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OUTBOX_STEPS, REPLICA_STEPS } from "../ddl.ts";
import {
  advanceAppliedSeq,
  COPY_SUFFIX,
  type LedgerFs,
  type Migration,
  migrateOutbox,
  migrateReplica,
  OUTBOX_BACKFILLS,
  OUTBOX_MIGRATIONS,
  REPLICA_BACKFILLS,
  REPLICA_MIGRATIONS,
  readAppliedSeq,
} from "../migrate.ts";
import { openLedger } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

const {
  accounts,
  counterpartyMerges,
  currencies,
  fxRates,
  outbox,
  transactions,
  transactionLines,
} = schema;
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
 * An outbox entry at version 1, inserted as raw SQL rather than through the
 * typed `outbox` table object — the typed insert names `blocked_disposition`,
 * which does not exist until `0001_schema` (version 2) adds it.
 */
function insertOutboxEntryAtV1(ledger: Ledger, entryId: string) {
  const now = Date.now();
  ledger.outbox.db.run(
    sql`insert into "outbox" ("id", "seq", "operation", "payload", "deps", "op_version", "captured_at", "captured_tz", "captured_offset_minutes") values (${entryId}, 1, 'create_transaction', '{}', '[]', 1, ${now}, 'Europe/Warsaw', 120)`,
  );
}

/**
 * A counterparty, inserted as raw SQL rather than through the typed
 * `counterparties` table object.
 *
 * **Deliberately, not an oversight.** The drizzle schema object always
 * includes `name_folded` — it is the *current* shape of the table — but a
 * database sitting below version 7 (`0006_schema`, the step that adds the
 * column) does not have it yet, and a typed `.insert()` would name it in the
 * generated `INSERT` regardless of which version the file is actually at.
 * Only the columns every version in this suite has are named here.
 */
function insertCounterparty(
  ledger: Ledger,
  counterpartyId: string,
  name: string,
  when = Date.now(),
) {
  ledger.replica.db.run(
    sql`insert into "counterparties" ("id", "name", "created_at", "updated_at") values (${counterpartyId}, ${name}, ${when}, ${when})`,
  );
}

/**
 * One more version appended to `base`, which either creates a marker table or
 * dies trying — for proving what a failed step does and does not leave
 * behind, over the real chain sliced to wherever the test needs it rather
 * than a hand-maintained parallel one.
 */
function withExtraStep(base: readonly Migration[], mode: "creates" | "throws"): Migration[] {
  const nextVersion = (base.at(-1)?.version ?? 0) + 1;
  return [
    ...base,
    {
      version: nextVersion,
      up: (tx) => {
        if (mode === "throws") throw new Error("killed mid-migration");
        tx.run(sql.raw('create table "v_extra_marker" ("a" integer)'));
      },
    },
  ];
}

/* ── a fresh database ────────────────────────────────────────────────────── */

describe("a fresh database", () => {
  it("migrates the replica to current and says so in `user_version`", () => {
    const ledger = openAt("fresh");
    const result = migrateReplica(ledger.replica, { fs: realFs });
    ledger.close();

    expect(result.from).toBe(0);
    expect(result.to).toBe(REPLICA_MIGRATIONS.length);
    expect(result.applied).toEqual(REPLICA_MIGRATIONS.map((m) => m.version));
    expect(result.refetchRequired, "nothing is ever dropped, so nothing is ever refetched").toBe(
      false,
    );

    const names = inspect(join(dir, "fresh-replica.db"), tableNames);
    expect(names, "the fifteen shared tables plus the replica's meta store").toHaveLength(16);
    expect(names).toContain("transactions");
    expect(names).toContain("local_meta");
    expect(names, "the outbox is the other file's table").not.toContain("outbox");

    expect(inspect(join(dir, "fresh-replica.db"), userVersion)).toBe(REPLICA_MIGRATIONS.length);
  });

  it("migrates the outbox, and only the outbox, into the second file", () => {
    const ledger = openAt("fresh");
    const result = migrateOutbox(ledger.outbox, { fs: realFs });
    ledger.close();

    expect(result.applied).toEqual(OUTBOX_MIGRATIONS.map((m) => m.version));
    expect(inspect(join(dir, "fresh-outbox.db"), tableNames)).toEqual(["outbox", "outbox_seq"]);
    expect(inspect(join(dir, "fresh-outbox.db"), userVersion)).toBe(OUTBOX_MIGRATIONS.length);
  });

  it("is a no-op the second time", () => {
    const ledger = openAt("twice");

    const first = migrateReplica(ledger.replica, { fs: realFs });
    // Release it, so what the second run reports is about the second run.
    first.copy?.release();

    const second = migrateReplica(ledger.replica, { fs: realFs });
    ledger.close();

    expect(second.from).toBe(REPLICA_MIGRATIONS.length);
    expect(second.to).toBe(REPLICA_MIGRATIONS.length);
    expect(second.applied, "no step ran again").toEqual([]);
    expect(second.copy, "and nothing was copied, because nothing was written").toBeNull();
  });

  it("hands back an unreleased copy even when there is nothing to migrate", () => {
    const ledger = openAt("outstanding");
    migrateReplica(ledger.replica, { fs: realFs });

    // The app migrated and then never opened cleanly. On the next launch there
    // is nothing to do — but the copy is still the record of that, and the
    // caller needs it back to release it once the app finally does open.
    const second = migrateReplica(ledger.replica, { fs: realFs });
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
        migrations: withExtraStep(OUTBOX_MIGRATIONS, "throws"),
      }),
    ).toThrow("killed mid-migration");
    ledger.close();

    const path = join(dir, "rollback-outbox.db");
    expect(
      inspect(path, userVersion),
      "still at the version before the failing step — the bump is inside the transaction",
    ).toBe(OUTBOX_MIGRATIONS.length);
    expect(
      inspect(path, (db) => db.prepare("select count(*) as n from outbox").get()),
      "and the entries are untouched",
    ).toEqual({ n: 1 });
  });

  /**
   * The same property on the replica, over a real, populated table — the
   * step that fails runs in the same one transaction as every step before it
   * in this batch, so a failure anywhere in the run leaves the whole thing
   * exactly where it started.
   */
  it("leaves `user_version` and every row exactly as they were, on the replica", () => {
    const ledger = openAt("rollback-replica");
    const atV3 = REPLICA_MIGRATIONS.slice(0, 3);
    migrateReplica(ledger.replica, { fs: realFs, migrations: atV3 }).copy?.release();
    seedTransaction(ledger, "txn-1");

    expect(() =>
      migrateReplica(ledger.replica, {
        fs: realFs,
        migrations: withExtraStep(atV3, "throws"),
      }),
    ).toThrow("killed mid-migration");
    ledger.close();

    const path = join(dir, "rollback-replica-replica.db");
    expect(inspect(path, userVersion)).toBe(3);
    expect(
      inspect(path, transactionCount),
      "the failed step rolled back with everything else",
    ).toBe(1);
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
    ledger.outbox.db.run(sql.raw("pragma user_version = 999"));

    expect(() => migrateOutbox(ledger.outbox, { fs: realFs })).toThrow(/never dropped/);
    ledger.close();

    const path = join(dir, "ahead-outbox.db");
    expect(inspect(path, userVersion), "untouched").toBe(999);
    expect(
      inspect(path, (db) => db.prepare("select id from outbox").all()),
      "the entry is still there — this is the file that has no second copy",
    ).toEqual([{ id: "e-1" }]);
    expect(existsSync(path + COPY_SUFFIX), "and nothing was even copied").toBe(false);
  });

  it("refuses a version that is not in this build's chain", () => {
    const ledger = openAt("gap");
    // A totally synthetic chain and an arbitrary in-between version — this is
    // a property of `checkChain`/`refuseUnknownVersion`, not of the real
    // migration count, so it does not need the real chain at all.
    ledger.outbox.db.run(sql.raw("pragma user_version = 500"));
    const chain: Migration[] = [
      { version: 1, up: (tx) => tx.run(sql.raw('create table "v1" ("a" integer)')) },
      { version: 501, up: (tx) => tx.run(sql.raw('create table "v501" ("a" integer)')) },
    ];

    expect(() => migrateOutbox(ledger.outbox, { fs: realFs, migrations: chain })).toThrow(
      /never a reset/,
    );
    ledger.close();

    expect(inspect(join(dir, "gap-outbox.db"), userVersion)).toBe(500);
  });
});

/* ── a version ahead of this build, on the replica too ───────────────────── */

describe("a replica version ahead of this build", () => {
  /**
   * There is no drop-and-refetch left in this module (see `migrate.ts`'s own
   * header) — a schema version the build does not recognise is refused the
   * same way `migrateOutbox` refuses one, never treated as a reason to guess.
   */
  it("raises and writes nothing", () => {
    const ledger = openAt("replica-ahead");
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
    seedTransaction(ledger, "txn-1");
    ledger.replica.db.run(sql.raw("pragma user_version = 999"));

    expect(() => migrateReplica(ledger.replica, { fs: realFs })).toThrow(/newer app/);
    ledger.close();

    const path = join(dir, "replica-ahead-replica.db");
    expect(inspect(path, userVersion), "untouched").toBe(999);
    expect(inspect(path, transactionCount), "the ledger is still the ledger").toBe(1);
    expect(
      existsSync(path + COPY_SUFFIX),
      "nothing was written at all — not even the copy that precedes writing",
    ).toBe(false);
  });
});

/* ── an upgraded phone has what a fresh install has ──────────────────────── */

type MasterRow = {
  readonly type: string;
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string;
};

/**
 * `sqlite_master.sql`, normalised so a rebuild's own side effects don't read
 * as drift: SQLite requotes a renamed table's outer `CREATE TABLE` in double
 * quotes regardless of how the generated file quoted it, collapses nothing
 * about the whitespace a hand-formatted multi-line `CREATE TABLE` carries,
 * and a `CHECK`'s self-qualified column references are rewritten from
 * `__new_<table>` to the table's real name on rename (proven by hand against
 * `better-sqlite3` — the fixture this repo's own rebuild step exercises).
 * None of that is a difference between a fresh install and an upgraded one;
 * it is SQLite's rename behaviour, identical on both paths.
 */
function normalizeSql(text: string | null): string {
  if (text === null) return "";
  return text
    .replace(/`([^`]*)`/g, '"$1"')
    .replace(/__new_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function masterRows(db: Database.Database): MasterRow[] {
  return (
    db
      .prepare(
        "select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name",
      )
      .all() as { type: string; name: string; tbl_name: string; sql: string | null }[]
  ).map((row) => ({ ...row, sql: normalizeSql(row.sql) }));
}

describe("an upgraded phone has what a fresh install has", () => {
  /**
   * **The drift test.** For every point a phone could have stopped at, run
   * the chain up to there, then finish it — and compare the result against a
   * database that ran the whole chain in one launch. If the two ever
   * disagree, some step behaves differently depending on how much of the
   * chain already ran before it, which is exactly the property an
   * already-installed phone depends on and a fresh install can never
   * exercise.
   */
  it("matches a fresh install's sqlite_master at every partial starting point — replica", () => {
    const fresh = openAt("fresh-ref-r");
    migrateReplica(fresh.replica, { fs: realFs }).copy?.release();
    const freshMaster = inspect(join(dir, "fresh-ref-r-replica.db"), masterRows);
    fresh.close();

    const n = REPLICA_MIGRATIONS.length;
    for (let k = 1; k < n; k++) {
      const name = `upgrade-r-${k}`;
      const ledger = openAt(name);
      migrateReplica(ledger.replica, {
        fs: realFs,
        migrations: REPLICA_MIGRATIONS.slice(0, k),
      }).copy?.release();
      migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
      ledger.close();

      const upgradedMaster = inspect(join(dir, `${name}-replica.db`), masterRows);
      expect(upgradedMaster, `starting from version ${k}`).toEqual(freshMaster);
    }
  });

  it("matches a fresh install's sqlite_master at every partial starting point — outbox", () => {
    const fresh = openAt("fresh-ref-o");
    migrateOutbox(fresh.outbox, { fs: realFs }).copy?.release();
    const freshMaster = inspect(join(dir, "fresh-ref-o-outbox.db"), masterRows);
    fresh.close();

    const n = OUTBOX_MIGRATIONS.length;
    for (let k = 1; k < n; k++) {
      const name = `upgrade-o-${k}`;
      const ledger = openAt(name);
      migrateOutbox(ledger.outbox, {
        fs: realFs,
        migrations: OUTBOX_MIGRATIONS.slice(0, k),
      }).copy?.release();
      migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();
      ledger.close();

      const upgradedMaster = inspect(join(dir, `${name}-outbox.db`), masterRows);
      expect(upgradedMaster, `starting from version ${k}`).toEqual(freshMaster);
    }
  });
});

/* ── a populated replica upgrades cleanly ─────────────────────────────────── */

describe("a populated replica upgrades to current without losing anything", () => {
  it("keeps every row, backfills name_folded, and the new index is enforced", () => {
    const ledger = openAt("populated");

    // Version 5 — `counterparty_merges`, `counterparty_distinct_pairs` and the
    // old ASCII-only unique index exist; `name_folded` does not yet.
    const atV5 = REPLICA_MIGRATIONS.slice(0, 5);
    migrateReplica(ledger.replica, { fs: realFs, migrations: atV5 }).copy?.release();
    migrateOutbox(ledger.outbox, {
      fs: realFs,
      migrations: OUTBOX_MIGRATIONS.slice(0, 1),
    }).copy?.release();

    seedTransaction(ledger, "txn-1");
    ledger.replica.db
      .insert(currencies)
      .values({ code: currencyCode("USD"), name: "Placeholder" })
      .onConflictDoNothing()
      .run();
    ledger.replica.db
      .insert(fxRates)
      .values({
        base: currencyCode("PLN"),
        quote: currencyCode("USD"),
        date: accountingDate("2026-03-01"),
        rate: money.unitsPerPivot("4.00"),
        source: "manual",
      })
      .run();

    // Three counterparties, each exercising a different way `fold()` has to
    // normalise a name: plain ASCII, Polish diacritics in both letter cases
    // in the one name, and an NFD (decomposed) spelling of an accented name.
    insertCounterparty(ledger, "cp-ascii", "Anna Kowalska");
    insertCounterparty(ledger, "cp-diacritics", "Łódź Śliwka");
    insertCounterparty(ledger, "cp-nfd", "Józef".normalize("NFD"));

    ledger.replica.db
      .insert(counterpartyMerges)
      .values({
        id: id<"counterpartyMerges">("merge-1"),
        winnerId: id<"counterparties">("cp-ascii") as Id<"counterparties">,
        loserId: id<"counterparties">("cp-diacritics") as Id<"counterparties">,
      })
      .run();

    insertOutboxEntryAtV1(ledger, "e-1");

    const outboxResult = migrateOutbox(ledger.outbox, { fs: realFs });
    const replicaResult = migrateReplica(ledger.replica, { fs: realFs });
    ledger.close();

    expect(outboxResult.to).toBe(OUTBOX_MIGRATIONS.length);
    expect(replicaResult.to).toBe(REPLICA_MIGRATIONS.length);

    const replicaPath = join(dir, "populated-replica.db");
    const outboxPath = join(dir, "populated-outbox.db");

    expect(inspect(replicaPath, transactionCount), "the transaction survived").toBe(1);
    expect(
      inspect(replicaPath, (db) =>
        db.prepare("select count(*) as n from counterparty_merges").get(),
      ),
      "the merge record survived its own table's rebuild",
    ).toEqual({ n: 1 });
    expect(
      inspect(replicaPath, (db) => db.prepare("select count(*) as n from fx_rates").get()),
      "and so did the rate",
    ).toEqual({ n: 1 });
    expect(
      inspect(outboxPath, (db) => db.prepare("select count(*) as n from outbox").get()),
      "the outbox entry survived too",
    ).toEqual({ n: 1 });

    const rows = inspect(replicaPath, (db) =>
      db.prepare('select "id", "name", "name_folded" from "counterparties"').all(),
    ) as { id: string; name: string; name_folded: string }[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.name_folded, `${row.id}: ${JSON.stringify(row.name)}`).toBe(fold(row.name));
    }

    expect(
      inspect(replicaPath, (db) =>
        db
          .prepare("select name from sqlite_master where type = 'index' and name = ?")
          .get("counterparties_name_uq"),
      ),
      "the partial unique index on name_folded exists",
    ).toBeTruthy();

    expect(() =>
      inspect(replicaPath, (db) =>
        db
          .prepare(
            'insert into "counterparties" ("id", "name", "name_folded", "created_at", "updated_at") values (?, ?, ?, ?, ?)',
          )
          .run("cp-dup", "ANNA KOWALSKA", fold("ANNA KOWALSKA"), Date.now(), Date.now()),
      ),
    ).toThrow(/UNIQUE constraint failed/i);
  });
});

/* ── every backfill hook names a real step ───────────────────────────────── */

describe("every *_BACKFILLS key names a real step", () => {
  it("REPLICA_BACKFILLS", () => {
    const tags = new Set(REPLICA_STEPS.map((s) => s.tag));
    expect(Object.keys(REPLICA_BACKFILLS).length, "vacuity guard").toBeGreaterThan(0);
    for (const key of Object.keys(REPLICA_BACKFILLS)) {
      expect(tags.has(key), `REPLICA_BACKFILLS["${key}"] names no REPLICA_STEPS tag`).toBe(true);
    }
  });

  it("OUTBOX_BACKFILLS", () => {
    const tags = new Set(OUTBOX_STEPS.map((s) => s.tag));
    for (const key of Object.keys(OUTBOX_BACKFILLS)) {
      expect(tags.has(key), `OUTBOX_BACKFILLS["${key}"] names no OUTBOX_STEPS tag`).toBe(true);
    }
  });
});

/* ── the 0006_schema backfill, in isolation ──────────────────────────────── */

describe("the `0006_schema` backfill", () => {
  /**
   * The `SqlRunner` handed to `up`, exercised directly rather than through
   * `migrateReplica` — this is the hook itself, run against a table whose
   * `name_folded` column is still every row's `''` default, the way
   * `ALTER TABLE … ADD name_folded text DEFAULT ''` leaves it.
   */
  it("fills every row's name_folded from '' via fold(name)", () => {
    const ledger = openAt("backfill-hook");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, 5),
    }).copy?.release();

    insertCounterparty(ledger, "cp-1", "Anna Kowalska");
    insertCounterparty(ledger, "cp-2", "Łukasz");
    insertCounterparty(ledger, "cp-3", "Józef".normalize("NFD"));

    const step = REPLICA_STEPS[6];
    expect(step?.tag).toBe("0006_schema");
    const backfill = REPLICA_BACKFILLS["0006_schema"];
    expect(backfill).toBeDefined();

    // biome-ignore lint/style/noNonNullAssertion: asserted defined immediately above
    ledger.replica.db.transaction((tx) => backfill!(tx, step?.statements ?? []));
    ledger.close();

    const path = join(dir, "backfill-hook-replica.db");
    const rows = inspect(path, (db) =>
      db.prepare('select "id", "name", "name_folded" from "counterparties"').all(),
    ) as { id: string; name: string; name_folded: string }[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.name_folded).toBe(fold(row.name));
      expect(row.name_folded, "no row keeps the default").not.toBe("");
    }
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
      migrations: withExtraStep(OUTBOX_MIGRATIONS, "creates"),
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
    const atV3 = REPLICA_MIGRATIONS.slice(0, 3);
    migrateReplica(ledger.replica, { fs: realFs, migrations: atV3 }).copy?.release();
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
      migrations: withExtraStep(atV3, "creates"),
    });
    ledger.close();

    expect(atCopyTime, "copied exactly once").toHaveLength(1);
    expect(
      atCopyTime[0],
      "the database was still at version 3 with its row when the copy was taken",
    ).toEqual({ version: 3, rows: 1 });

    // And the file on disk is that state, not a checkpoint-stale version of it:
    // WAL keeps recent commits in the `-wal` sibling until they are folded back,
    // so a copy taken without a checkpoint would be missing the seeded row.
    const copyPath = `${path}${COPY_SUFFIX}`;
    expect(result.copy?.path).toBe(copyPath);
    expect(inspect(copyPath, userVersion)).toBe(3);
    expect(inspect(copyPath, transactionCount), "the row that was there a moment ago").toBe(1);

    // The live database has moved on, which is what makes the copy worth having.
    expect(inspect(path, userVersion)).toBe(4);
  });

  it("is retained until it is explicitly released", () => {
    const ledger = openAt("retain");
    const result = migrateReplica(ledger.replica, { fs: realFs });
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
    const atV1 = REPLICA_MIGRATIONS.slice(0, 1);
    migrateReplica(ledger.replica, { fs: realFs, migrations: atV1 });

    expect(() =>
      migrateReplica(ledger.replica, {
        fs: realFs,
        migrations: withExtraStep(atV1, "creates"),
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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 12));
    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 4));

    expect(readAppliedSeq(ledger.replica.db), "a rewind would re-apply settled entries").toBe(12);
    ledger.close();
  });

  /**
   * A schema migration is DDL (plus, sometimes, a data backfill of an
   * existing column) — nothing about it changes what has already been
   * applied from the outbox, so the watermark a step's transaction commits
   * with is the same one it started with.
   */
  it("is untouched by a schema migration", () => {
    const ledger = openAt("watermark-migrate");
    const atV3 = REPLICA_MIGRATIONS.slice(0, 3);
    migrateReplica(ledger.replica, { fs: realFs, migrations: atV3 }).copy?.release();
    ledger.replica.db.transaction((tx) => advanceAppliedSeq(tx, 31));

    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

    expect(readAppliedSeq(ledger.replica.db)).toBe(31);
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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
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
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
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
   * A child row too (`ON DELETE CASCADE` on `transaction_lines.transaction_id`)
   * — the row a naive copy-rename-drop of `transactions`, run with foreign
   * keys still enforced, would cascade away even though nothing asked it to.
   * `runInOneTransaction`'s `foreignKeysOff` is what this proves, over the
   * real chain rather than a synthetic one: `0007_schema` is the rebuild that
   * adds `transactions_debt_amount_requires_currency`.
   */
  it("keeps a child row through the transactions rebuild, and ships the new CHECK", () => {
    const ledger = openAt("rebuild-fk");
    // Everything up to, but not including, the rebuild that adds the CHECK —
    // `transactions` exists in its pre-CHECK shape, ready to seed.
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, -1),
    }).copy?.release();
    seedTransaction(ledger, "txn-1");
    ledger.replica.db
      .insert(transactionLines)
      .values({
        id: id<"transactionLines">("line-1"),
        transactionId: id<"transactions">("txn-1") as Id<"transactions">,
        description: "Room",
        amount: money.toMoney("18.00"),
      })
      .run();

    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

    const cause = refusal(() =>
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
        .run(),
    );
    expect(cause, "the rebuilt table enforces the CHECK").toMatch(/CHECK constraint failed/i);
    ledger.close();

    const path = join(dir, "rebuild-fk-replica.db");
    expect(
      inspect(path, transactionCount),
      "the transaction survived its own table's rebuild",
    ).toBe(1);
    expect(
      inspect(path, (db) => db.prepare("select count(*) as n from transaction_lines").get()),
      "and so did the child row `ON DELETE CASCADE` could otherwise have taken with it",
    ).toEqual({ n: 1 });
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
