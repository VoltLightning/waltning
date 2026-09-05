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
import { stepsIn } from "../../tools/steps.ts";
import { REPLICA_STEPS } from "../ddl.ts";
import {
  advanceAppliedSeq,
  COPY_SUFFIX,
  checksumOf,
  type LedgerFs,
  MIGRATION_JOURNAL,
  type Migration,
  migrateOutbox,
  migrateReplica,
  OUTBOX_MIGRATIONS,
  PreJournalStoreError,
  REPLICA_MIGRATIONS,
  readAppliedSeq,
} from "../migrate.ts";
import { openLedger } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

const { accounts, counterpartyMerges, currencies, outbox, transactions, transactionLines } = schema;
const outboxSchema = { outbox: schema.outbox, outboxSeq: schema.outboxSeq };
const replicaSchema = {
  accountGroups: schema.accountGroups,
  accounts: schema.accounts,
  brandAliases: schema.brandAliases,
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

/**
 * A row, so "the tables are untouched" can be about contents and not only
 * names.
 *
 * **Raw SQL, not the query builder bound to `transactions`.** Drizzle's
 * insert builder names *every* column the schema module declares — `null`
 * literal and all — regardless of which ones `.values()` actually sets
 * (proved against this exact table while diagnosing §14.4b's own `brand_key`/
 * `brand_source`, the first columns `transactions` has ever grown past its
 * `0000_schema` shape). That is fine against a fully migrated table and
 * wrong here on purpose: several call sites seed a row after running only a
 * *prefix* of `REPLICA_MIGRATIONS`, deliberately before a later column
 * exists, to prove a mid-chain failure leaves that row untouched. A
 * schema-aware insert would reference a column the real table does not have
 * yet and fail with a SQLite error that has nothing to do with what the test
 * is proving.
 */
function seedTransaction(ledger: Ledger, txnId: string) {
  seedReferences(ledger);
  ledger.replica.db.run(sql`
    insert into transactions
      (id, date, type, account_id, amount_original, currency, fx_rate, created_at, updated_at)
    values (${txnId}, '2026-03-12', 'expense', 'acc-1', '18.00', 'PLN', '1.000000000000', 0, 0)
  `);
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
 * A rate, inserted as raw SQL rather than through the typed `fxRates` table
 * object — the same reason `insertCounterparty` is.
 *
 * **Deliberately, not an oversight.** The drizzle schema object always
 * includes `displaced_rate`, `displaced_source` and `displaced_fetched_at` —
 * it is the *current* shape of the table — but a database sitting below
 * version 10 (`0009_schema`, the step that adds the three columns) does not
 * have them yet, and a typed `.insert()` would name them in the generated
 * `INSERT` regardless of which version the file is actually at. Only the
 * columns every version in this suite has are named here.
 */
/** The two currencies `insertFxRate`'s foreign keys need, present from the schema's earliest version. */
function seedCurrencies(ledger: Ledger) {
  for (const code of ["PLN", "USD"] as const) {
    ledger.replica.db
      .insert(currencies)
      .values({ code: currencyCode(code), name: "Placeholder" })
      .onConflictDoNothing()
      .run();
  }
}

function insertFxRate(ledger: Ledger, base: string, quote: string, date: string, rate: string) {
  ledger.replica.db.run(
    sql`insert into "fx_rates" ("base", "quote", "date", "rate", "source") values (${base}, ${quote}, ${date}, ${rate}, 'manual')`,
  );
}

/**
 * The message a call refuses with, or a failure if it did not refuse at all.
 *
 * `toThrow(/…/)` proves one substring; several of the journal's refusals are
 * judged on *what else* they do not say (the duplicate-key error they used to
 * bury the cause under) and on being identical twice running, and neither is
 * a matcher.
 */
function refusalMessage(attempt: () => unknown): string {
  try {
    attempt();
  } catch (error) {
    // `catch` bindings are `unknown` because the language gives no choice.
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal, and nothing was thrown");
}

/** The same shape as `refusalMessage`, but the error itself — for asserting its class and fields. */
function refusalError(attempt: () => unknown): Error {
  try {
    attempt();
  } catch (error) {
    // `catch` bindings are `unknown` because the language gives no choice.
    if (error instanceof Error) return error;
    throw new Error(String(error));
  }
  throw new Error("expected a refusal, and nothing was thrown");
}

/**
 * One more version appended to `base`, which either creates a marker table or
 * dies trying — for proving what a failed step does and does not leave
 * behind, over the real chain sliced to wherever the test needs it rather
 * than a hand-maintained parallel one.
 */
function withExtraStep(base: readonly Migration[], mode: "creates" | "throws"): Migration[] {
  const nextVersion = (base.at(-1)?.version ?? 0) + 1;
  // A tag whose own four-digit prefix names its version, because `checkChain`
  // insists on that for every chain, hand-built ones included — a step the
  // journal keys on has to be identified the same way a generated one is.
  const tag = `${String(nextVersion - 1).padStart(4, "0")}_extra`;
  return [
    ...base,
    {
      version: nextVersion,
      tag,
      checksum: checksumOf([`extra step that ${mode}`]),
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
    expect(
      names,
      "the sixteen shared tables (§14.4b adds brand_aliases), the replica's meta store, and the migrator's own journal",
    ).toHaveLength(18);
    expect(names).toContain("transactions");
    expect(names).toContain("local_meta");
    // Created by the migrator itself, not by any generated step — so it is on
    // a fresh install too, and it is what every later launch reads to decide
    // which steps have run (`MIGRATION_JOURNAL`).
    expect(names).toContain(MIGRATION_JOURNAL);
    expect(names, "the outbox is the other file's table").not.toContain("outbox");

    expect(inspect(join(dir, "fresh-replica.db"), userVersion)).toBe(REPLICA_MIGRATIONS.length);
  });

  it("migrates the outbox, and only the outbox, into the second file", () => {
    const ledger = openAt("fresh");
    const result = migrateOutbox(ledger.outbox, { fs: realFs });
    ledger.close();

    expect(result.applied).toEqual(OUTBOX_MIGRATIONS.map((m) => m.version));
    expect(inspect(join(dir, "fresh-outbox.db"), tableNames)).toEqual([
      MIGRATION_JOURNAL,
      "outbox",
      "outbox_seq",
    ]);
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

    const failing = withExtraStep(OUTBOX_MIGRATIONS, "throws");
    expect(() => migrateOutbox(ledger.outbox, { fs: realFs, migrations: failing })).toThrow(
      "killed mid-migration",
    );

    const path = join(dir, "rollback-outbox.db");

    // H2 — and the copy went with it. The rollback was clean, so the file on
    // disk is byte-for-byte what the copy was taken from, and keeping the copy
    // would make the *next* launch report `refuseStaleCopy` rather than the
    // reason the migration failed.
    expect(existsSync(path + COPY_SUFFIX), "no copy is left behind by a clean rollback").toBe(
      false,
    );
    expect(
      () => migrateOutbox(ledger.outbox, { fs: realFs, migrations: failing }),
      "so the second launch gives the same cause, not a leftover copy",
    ).toThrow("killed mid-migration");

    ledger.close();

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

    const failing = withExtraStep(atV3, "throws");
    expect(() => migrateReplica(ledger.replica, { fs: realFs, migrations: failing })).toThrow(
      "killed mid-migration",
    );

    const path = join(dir, "rollback-replica-replica.db");

    // H2, on the file where it costs the most: a replica that cannot migrate
    // is the whole ledger, and a refusal naming a leftover copy tells its
    // owner nothing about why.
    expect(existsSync(path + COPY_SUFFIX)).toBe(false);
    expect(() => migrateReplica(ledger.replica, { fs: realFs, migrations: failing })).toThrow(
      "killed mid-migration",
    );

    ledger.close();

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
      {
        version: 1,
        tag: "0000_v1",
        checksum: checksumOf(['create table "v1" ("a" integer)']),
        up: (tx) => tx.run(sql.raw('create table "v1" ("a" integer)')),
      },
      {
        version: 501,
        tag: "0500_v501",
        checksum: checksumOf(['create table "v501" ("a" integer)']),
        up: (tx) => tx.run(sql.raw('create table "v501" ("a" integer)')),
      },
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
    insertFxRate(ledger, "PLN", "USD", "2026-03-01", "4.00");

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

/* ── a version names a file, not a position ──────────────────────────────── */

describe("`user_version` records which step ran, not how many", () => {
  it("gives every generated file the version its own four-digit prefix names", () => {
    for (const migration of [...REPLICA_MIGRATIONS, ...OUTBOX_MIGRATIONS]) {
      const tag = migration.tag;
      expect(tag, "a generated chain's step carries its own file's tag").toBeDefined();
      expect(migration.version, `${tag}'s version`).toBe(Number(tag?.slice(0, 4)) + 1);
    }
  });

  /**
   * The property the number exists for: a database written by an older build
   * opens under a longer chain and runs exactly the steps it has not run —
   * never all of them, never none.
   */
  it("opens a database at an older version under a longer chain, running only what is missing", () => {
    const ledger = openAt("older-version");
    const short = REPLICA_MIGRATIONS.slice(0, -1);
    const shortHead = short.at(-1)?.version;
    const head = REPLICA_MIGRATIONS.at(-1)?.version;
    migrateReplica(ledger.replica, { fs: realFs, migrations: short }).copy?.release();
    expect(inspect(join(dir, "older-version-replica.db"), userVersion)).toBe(shortHead);

    const result = migrateReplica(ledger.replica, { fs: realFs });
    ledger.close();

    expect(result.from).toBe(shortHead);
    expect(result.to).toBe(head);
    expect(result.applied, "only the one step it had not run").toEqual([head]);
  });
});

/* ── the applied-steps journal ────────────────────────────── */

/**
 * **A number is not an identity, and neither is a filename.**
 *
 * `user_version` says how far a chain got. It does not say *which* chain, and
 * this repository has already shipped one where the answer differs: the build
 * on `main` before this branch had a single-version replica chain, so a
 * database it wrote sits at `user_version = 1` with every table already
 * present. Read against the chain here, `1` means "only `0000_schema` has
 * run" — so the migrator ran `0001_database_objects` over a database that
 * already had it, died on `local_meta`'s duplicate primary key, and left the
 * pre-migration copy behind. Every launch after that reported the copy
 * (`refuseStaleCopy`) instead of the cause.
 *
 * `__ledger_migrations` is what closes it: a row per step, keyed on the tag,
 * carrying the checksum of the statements that ran. The three properties
 * below are the three things it makes possible.
 */
describe("`__ledger_migrations`, the applied-steps journal", () => {
  /**
   * A database in the shape `main`'s build left: every table present, because
   * every step's statements ran, but `user_version` stamped to that build's
   * own single-version head and no journal, because that build had none.
   *
   * The steps are applied through `up` directly rather than through
   * `migrateReplica`, which is exactly what makes this the pre-journal shape
   * — the journal is `runInOneTransaction`'s to write, and nothing here goes
   * near it.
   */
  function seedPreJournalReplica(ledger: Ledger, stampedVersion: number) {
    for (const migration of REPLICA_MIGRATIONS) migration.up(ledger.replica.db);
    ledger.replica.db.run(sql.raw(`pragma user_version = ${stampedVersion}`));
  }

  it("refuses a database written before the journal existed, and repeats the same cause", () => {
    const ledger = openAt("pre-journal");
    seedPreJournalReplica(ledger, 1);

    const first = refusalMessage(() => migrateReplica(ledger.replica, { fs: realFs }));
    expect(first).toMatch(new RegExp(MIGRATION_JOURNAL));
    // M-2: the migrator states only the fact and that nothing has been
    // written — the recovery (rebuild, or a refusal naming files to delete)
    // is `session.ts`'s own decision, per its `preJournalStores` option, so
    // it is not spelled out in this message at all.
    expect(first, "nothing has been written, stated plainly").toContain(
      "Nothing has been written.",
    );
    expect(first, "the recovery is not this module's to state").not.toMatch(
      /rebuild|delete|recovery/i,
    );
    // And it is the migrator's own sentence, not the driver's. Without the
    // journal this ran `0001_database_objects` over a database that already
    // had every object it creates, and what reached the person holding the
    // phone was `Failed to run the query 'CREATE TABLE …'` — a report of the
    // symptom, from two layers below the decision that caused it.
    expect(first).not.toMatch(/Failed to run the query/i);

    // The structured class carries what `session.ts` needs to act on —
    // the message alone never named the file; `path` is a field for
    // whichever caller decides what to do with it.
    const error = refusalError(() => migrateReplica(ledger.replica, { fs: realFs }));
    expect(error).toBeInstanceOf(PreJournalStoreError);
    if (error instanceof PreJournalStoreError) {
      expect(error.store).toBe("replica");
      expect(error.path).toBe(join(dir, "pre-journal-replica.db"));
      expect(error.version).toBe(1);
    }

    // Nothing was written and no copy taken, so the next launch reaches the
    // same refusal rather than reporting a leftover copy.
    expect(existsSync(join(dir, "pre-journal-replica.db") + COPY_SUFFIX)).toBe(false);
    expect(refusalMessage(() => migrateReplica(ledger.replica, { fs: realFs }))).toBe(first);

    ledger.close();
    expect(
      inspect(join(dir, "pre-journal-replica.db"), userVersion),
      "and the file is untouched, at the version it arrived at",
    ).toBe(1);
  });

  /**
   * The same refusal on the outbox, and it is the store where it matters
   * most: its entries are the only copy of intent nobody has been told about
   * (`architecture/08` §5), so a guess that runs a step twice is a guess made
   * over unrecoverable rows.
   */
  it("refuses a pre-journal outbox too", () => {
    const ledger = openAt("pre-journal-o");
    for (const migration of OUTBOX_MIGRATIONS) migration.up(ledger.outbox.db);
    ledger.outbox.db.run(sql.raw("pragma user_version = 1"));

    expect(() => migrateOutbox(ledger.outbox, { fs: realFs })).toThrow(
      new RegExp(`has no ${MIGRATION_JOURNAL} table`),
    );
    expect(existsSync(join(dir, "pre-journal-o-outbox.db") + COPY_SUFFIX)).toBe(false);
    ledger.close();
  });

  /**
   * The other half of identity. A generated file's statements are frozen once
   * an installed database has run them — edit one and every device that ran
   * the old version now disagrees with a fresh install about its own tables,
   * silently, because the filename and the number both still match.
   */
  it("refuses a step whose statements changed after it was applied, naming the tag", () => {
    const ledger = openAt("edited-step");
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();

    const edited = REPLICA_MIGRATIONS.map((migration) =>
      migration.tag === "0007_schema"
        ? { ...migration, checksum: checksumOf(["something else entirely"]) }
        : migration,
    );

    const message = refusalMessage(() =>
      migrateReplica(ledger.replica, { fs: realFs, migrations: edited }),
    );
    expect(message).toContain("0007_schema");
    expect(message).toContain("is not the one that ran here");
    expect(existsSync(join(dir, "edited-step-replica.db") + COPY_SUFFIX)).toBe(false);
    ledger.close();
  });

  /**
   * And the ordinary path: one row per step that ran, and a later launch
   * under a longer chain adds only the rows for the steps it actually
   * applied — never rewrites the ones already there.
   */
  it("records tag and checksum for each step, and only adds what a later launch runs", () => {
    const ledger = openAt("journal-rows");
    const short = REPLICA_MIGRATIONS.slice(0, -1);
    migrateReplica(ledger.replica, { fs: realFs, migrations: short }).copy?.release();

    const after = () =>
      inspect(
        join(dir, "journal-rows-replica.db"),
        (db) =>
          db.prepare(`select tag, checksum from "${MIGRATION_JOURNAL}" order by tag`).all() as {
            tag: string;
            checksum: string;
          }[],
      );

    expect(after()).toEqual(short.map((m) => ({ tag: m.tag, checksum: m.checksum })));

    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
    ledger.close();

    expect(after()).toEqual(REPLICA_MIGRATIONS.map((m) => ({ tag: m.tag, checksum: m.checksum })));
  });

  /**
   * **The checksum has to survive `pnpm ledger:generate`**, or the guarantee
   * above becomes a refusal every phone hits after any regeneration. The two
   * committed representations of a step are the `.sql` files drizzle-kit
   * writes and the `ddl.ts` embedded from them, and this reads both: the
   * chain's checksums must equal the ones derived from the files on disk,
   * through the same splitting rules the generator uses (`tools/steps.ts`,
   * imported rather than reimplemented, so there is no second copy to drift).
   *
   * That makes both halves of L3 a red test rather than a convention: a
   * `ddl.ts` edited by hand fails here, and so does a `.sql` changed without
   * regenerating. Biome running over `ddl.ts` inside the generate script is
   * what keeps the file byte-identical across runs, and it moves nothing
   * inside the template literals this hashes.
   */
  it.each([
    { store: "replica", dir: "../../drizzle/replica", chain: REPLICA_MIGRATIONS },
    { store: "outbox", dir: "../../drizzle/outbox", chain: OUTBOX_MIGRATIONS },
  ])("$store: every step's checksum is the one its own .sql file hashes to", (each) => {
    const fromDisk = stepsIn(new URL(each.dir, import.meta.url));

    expect(fromDisk.length, "vacuity guard").toBeGreaterThan(0);
    expect(fromDisk.map((step) => step.tag)).toEqual(each.chain.map((m) => m.tag));
    expect(fromDisk.map((step) => checksumOf(step.statements))).toEqual(
      each.chain.map((m) => m.checksum),
    );
  });
});

/* ── the 0006_schema backfill, in isolation ──────────────────────────────── */

describe("the `0006_schema` backfill", () => {
  /** Where `0006_schema` sits in the generated chain — the step the fill belongs to. */
  const stepIndex = REPLICA_STEPS.findIndex((step) => step.tag === "0006_schema");

  /**
   * The step's own `up`, run against a populated table: its statements, then
   * its fill, which is the whole shape under test. The `ALTER TABLE` that adds
   * `name_folded text DEFAULT ''` leaves every existing row at `''`, and
   * nothing may still be at `''` once `up` returns.
   */
  it("fills every row's name_folded from '' via fold(name.trim())", () => {
    const ledger = openAt("backfill-hook");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
    }).copy?.release();

    insertCounterparty(ledger, "cp-1", "Anna Kowalska");
    insertCounterparty(ledger, "cp-2", "Łukasz");
    insertCounterparty(ledger, "cp-3", "Józef".normalize("NFD"));

    // The trim is the executors' own — `create-counterparty.executor.ts`
    // folds `name.trim()` — so a migrated row has to land on the value a
    // freshly captured one would.
    insertCounterparty(ledger, "cp-4", "  Maria Nowak  ");

    const step = REPLICA_MIGRATIONS[stepIndex];
    expect(step?.tag).toBe("0006_schema");

    ledger.replica.db.transaction((tx) => {
      step?.up(tx);
    });
    ledger.close();

    const path = join(dir, "backfill-hook-replica.db");
    const rows = inspect(path, (db) =>
      db.prepare('select "id", "name", "name_folded" from "counterparties"').all(),
    ) as { id: string; name: string; name_folded: string }[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.name_folded).toBe(fold(row.name.trim()));
      expect(row.name_folded, "no row keeps the default").not.toBe("");
    }
  });

  /**
   * The precondition, through the real migrator. Two live counterparties the
   * fold unifies cannot both survive `0007_schema`'s partial unique index, and
   * choosing between them is S15's decision, never a migration's.
   *
   * Two properties make that refusal usable, and neither is visible from the
   * message alone: **nothing was written** — no copy taken, the version
   * unmoved — and **the next launch says the same thing**, rather than the
   * "a copy is still there" a refusal taken after the copy would report from
   * then on, which names the wrong cause and buries this one.
   */
  it("refuses a fold collision between two live rows before the copy, and repeats the same cause", () => {
    const ledger = openAt("fold-collision");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
    }).copy?.release();

    insertCounterparty(ledger, "cp-upper", "ŁUKASZ PLACEHOLDER");
    insertCounterparty(ledger, "cp-lower", "łukasz placeholder");

    const replicaPath = join(dir, "fold-collision-replica.db");
    const versionBefore = inspect(replicaPath, userVersion);
    const collision = /fold to one name/;

    expect(() => migrateReplica(ledger.replica, { fs: realFs })).toThrow(collision);
    expect(existsSync(`${replicaPath}${COPY_SUFFIX}`), "no copy was taken").toBe(false);
    expect(inspect(replicaPath, userVersion), "the version did not move").toBe(versionBefore);

    let second = "";
    try {
      migrateReplica(ledger.replica, { fs: realFs });
    } catch (error) {
      // `catch` bindings are `unknown` — the language gives no choice.
      second = error instanceof Error ? error.message : String(error);
    }
    ledger.close();

    expect(second).toMatch(collision);
    expect(second, "both rows, by id").toContain("cp-upper");
    expect(second).toContain("cp-lower");
    expect(second, "not the copy — there isn't one").not.toMatch(/pre-migration copy from an/);
  });

  /**
   * The same two spellings with one of them archived: legal before the upgrade
   * and legal after it, because `counterparties_name_uq` is partial (`where
   * not archived`). A check that refused this would turn a merge's own outcome
   * — S15 archives the loser — into an unupgradeable database.
   */
  it("allows the collision when one of the two rows is archived", () => {
    const ledger = openAt("fold-archived");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
    }).copy?.release();

    insertCounterparty(ledger, "cp-live", "Łukasz Placeholder");
    insertCounterparty(ledger, "cp-archived", "łukasz placeholder");
    ledger.replica.db.run(
      sql`update "counterparties" set "archived" = 1 where "id" = 'cp-archived'`,
    );

    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
    ledger.close();

    const rows = inspect(join(dir, "fold-archived-replica.db"), (db) =>
      db.prepare('select "id", "name_folded" from "counterparties" order by "id"').all(),
    ) as { id: string; name_folded: string }[];
    expect(rows.map((row) => row.name_folded)).toEqual([
      "lukasz placeholder",
      "lukasz placeholder",
    ]);
  });
});

/**
 * `0009_schema`'s backfill — the check-only shape `Backfill.fill` had to
 * become optional for. Before it existed, a replica holding a rate a
 * pre-bounds `change_pivot` minted outside `fx_rates_rate_bounds` — the
 * finding's own example is `5000000000000`, well past `RATE_MAX_EXCLUSIVE`
 * — failed the step's own `INSERT … SELECT` into `__new_fx_rates`, rolled
 * the whole migration back, and repeated that same unexplained failure on
 * every later launch, with no repair path.
 */
describe("the `0009_schema` backfill", () => {
  /** Where `0009_schema` sits in the generated chain — version 9 is everything before it. */
  const stepIndex = REPLICA_STEPS.findIndex((step) => step.tag === "0009_schema");

  it("refuses an out-of-bounds rate before the copy, naming the row, and repeats the same cause", () => {
    const ledger = openAt("rate-bounds");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
    }).copy?.release();

    seedCurrencies(ledger);
    insertFxRate(ledger, "PLN", "USD", "2026-03-01", "5000000000000");

    const replicaPath = join(dir, "rate-bounds-replica.db");
    const versionBefore = inspect(replicaPath, userVersion);
    const outOfBounds = /fx_rates_rate_bounds/;

    expect(() => migrateReplica(ledger.replica, { fs: realFs })).toThrow(outOfBounds);
    expect(existsSync(`${replicaPath}${COPY_SUFFIX}`), "no copy was taken").toBe(false);
    expect(inspect(replicaPath, userVersion), "the version did not move").toBe(versionBefore);

    const first = refusalMessage(() => migrateReplica(ledger.replica, { fs: realFs }));
    expect(first).toMatch(outOfBounds);
    expect(first, "the offending row, by base/quote/date").toContain("PLN/USD on 2026-03-01");
    expect(first).toContain("5000000000000");

    const second = refusalMessage(() => migrateReplica(ledger.replica, { fs: realFs }));
    expect(second, "the same launch reaches the same cause, every time").toBe(first);
    expect(existsSync(`${replicaPath}${COPY_SUFFIX}`), "still no copy, on the second launch").toBe(
      false,
    );

    ledger.close();
  });

  it("upgrades once the rate is deleted, and the journal records the step", () => {
    const ledger = openAt("rate-bounds-fixed");
    migrateReplica(ledger.replica, {
      fs: realFs,
      migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
    }).copy?.release();

    seedCurrencies(ledger);
    insertFxRate(ledger, "PLN", "USD", "2026-03-01", "5000000000000");

    const replicaPath = join(dir, "rate-bounds-fixed-replica.db");
    expect(() => migrateReplica(ledger.replica, { fs: realFs })).toThrow(/fx_rates_rate_bounds/);

    ledger.replica.db.run(
      sql`delete from "fx_rates" where "base" = 'PLN' and "quote" = 'USD' and "date" = '2026-03-01'`,
    );

    const result = migrateReplica(ledger.replica, { fs: realFs });
    result.copy?.release();
    ledger.close();

    expect(result.to).toBe(REPLICA_MIGRATIONS.length);
    const journaled = inspect(replicaPath, (db) =>
      db.prepare(`select "tag" from "${MIGRATION_JOURNAL}" where "tag" = ?`).get("0009_schema"),
    );
    expect(journaled, "the journal records 0009_schema as applied").toEqual({
      tag: "0009_schema",
    });
  });
});

/* ── the pre-migration copy ──────────────────────────────────────────────── */

describe("the pre-migration copy", () => {
  /**
   * **The rule is about pragmas that return rows, not about `run`.** Expo
   * SQLite leaves a result row active when a statement that produces one is
   * issued through anything but a full read, so every *result-bearing* pragma
   * this module sends — `user_version`, `foreign_keys` read back before it is
   * changed, and `wal_checkpoint(truncate)` — goes through `all`, which
   * consumes the row. So do the journal's own two reads (does the table
   * exist, and what does it hold), which are ordinary selects rather than
   * pragmas and are counted here for the same reason: nothing on this
   * connection may leave a row unread.
   *
   * A pragma *assignment* returns nothing at all, so `foreign_keys = OFF` and
   * its restore are `run`'s to send and always were: `migrateReplica` has
   * issued exactly those two the whole time. What changed is that
   * `migrateOutbox` now does too (both stores migrate with foreign keys off),
   * which is why the count below is two rather than none.
   */
  it("sends every result-bearing pragma through `all`, and only assignments through `run`", () => {
    const ledger = openAt("expo-pragmas");
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();

    const get = vi.spyOn(ledger.outbox.db, "get").mockImplementation(() => {
      throw new Error("Expo SQLite would leave the first result row active");
    });
    const run = vi.spyOn(ledger.outbox.db, "run");
    const all = vi.spyOn(ledger.outbox.db, "all");

    const result = migrateOutbox(ledger.outbox, {
      fs: realFs,
      migrations: withExtraStep(OUTBOX_MIGRATIONS, "creates"),
    });

    expect(get).not.toHaveBeenCalled();
    expect(
      all,
      "`user_version`, the journal's existence and contents, the checkpoint, and `foreign_keys` read back before it is changed",
    ).toHaveBeenCalledTimes(5);
    expect(run, "the two `foreign_keys` assignments, which return no rows").toHaveBeenCalledTimes(
      2,
    );
    // M2 — and the restore put back the value `open.ts` set for *this* store,
    // not a constant `ON`. The outbox references nothing and is opened with
    // foreign keys off deliberately; a migrator that ended with `= ON` handed
    // every later statement on this connection a stricter database than the
    // one that was configured.
    expect(ledger.outbox.db.all<{ foreign_keys: number }>(sql.raw("pragma foreign_keys"))).toEqual([
      { foreign_keys: 0 },
    ]);

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
  /**
   * Every object of a kind, as the file itself reports them — minus the
   * migrator's own journal, which no schema module declares and none ever
   * will: it is created by `migrate.ts` before the chain runs, so that the
   * chain has somewhere to record itself. The census below is about drift
   * between the schema modules and what ships; the journal belongs to neither
   * side of that comparison, and the fresh-database tests above are where its
   * presence is asserted instead.
   */
  function objects(db: Database.Database, type: "index" | "table"): string[] {
    return db
      .prepare("select name from sqlite_master where type = ? and name not like 'sqlite_%'")
      .all(type)
      .map((row) => (row as { name: string }).name)
      .filter((name) => name !== MIGRATION_JOURNAL)
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
   * Round 1's M1 — `recurring_transactions_brand_shape` on the device.
   * `SPEC.md` §14.4b names no engine exception and `architecture/14` §14.6
   * requires the phone to refuse at capture time what the server would
   * refuse, but SQLite got the two columns through a bare `ALTER TABLE …
   * ADD` (no `ADD CONSTRAINT` exists there) and so got no CHECK at all,
   * while Postgres refused the same row from the start. `0010_schema`
   * rebuilds the table for it; this is the break that proves the rebuild
   * shipped, against the real chain and the real file.
   *
   * Raw SQL rather than the query builder, for `seedTransaction`'s own
   * reason: drizzle's insert names every column the module declares, and
   * what is being proved here is what the *table* enforces.
   */
  it("enforces the recurring-rule brand shape too, on the device, not only on the server", () => {
    const ledger = openAt("recurring-brand");
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
    seedReferences(ledger);

    const insert = (columns: string, values: string) =>
      ledger.replica.db.run(
        sql.raw(`insert into recurring_transactions (${columns}) values (${values})`),
      );
    const COMMON = "type, account_id, amount_original, currency, rrule, created_at, updated_at";
    const COMMON_VALUES = "'expense', 'acc-1', '18.00', 'PLN', 'FREQ=MONTHLY', 0, 0";

    expect(
      refusal(() => insert(`id, ${COMMON}, brand_key`, `'rr-1', ${COMMON_VALUES}, 'orlen'`)),
      "a key with no source — the row a three-valued CHECK admits when it forgets `is not null`",
    ).toMatch(/CHECK constraint failed/i);
    expect(
      refusal(() => insert(`id, ${COMMON}, brand_source`, `'rr-2', ${COMMON_VALUES}, 'auto'`)),
      "and a source with no key",
    ).toMatch(/CHECK constraint failed/i);
    expect(
      refusal(() =>
        insert(
          `id, ${COMMON}, brand_key, brand_source`,
          `'rr-3', ${COMMON_VALUES}, 'orlen', 'none'`,
        ),
      ),
      "and a key paired with 'none', which by definition names a row with no key",
    ).toMatch(/CHECK constraint failed/i);

    // The two shapes it must admit: a resolved pair, and a deliberate "no
    // brand" (§14.4b's third `brand_source` value).
    insert(`id, ${COMMON}, brand_key, brand_source`, `'rr-4', ${COMMON_VALUES}, 'orlen', 'manual'`);
    insert(`id, ${COMMON}, brand_source`, `'rr-5', ${COMMON_VALUES}, 'none'`);
    insert(`id, ${COMMON}`, `'rr-6', ${COMMON_VALUES}`);

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

    expect(declared(replicaSchema), "vacuity guard").toHaveLength(17);
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
   * `runInOneTransaction`'s foreign-keys-off window is what this proves, over
   * the real chain rather than a synthetic one: `REPLICA_MIGRATIONS.slice(0,
   * -1)` stops one short of whichever migration is currently last, and the
   * chain's last step has been a `transactions` rebuild since `0008_schema`
   * (which added `transactions_debt_amount_requires_currency`, the CHECK this
   * test still asserts by name below) — most recently `0010_schema`
   * (round 1's L2: this comment named `0008_schema` specifically, which
   * silently stopped being the last step the moment `0010_schema` landed,
   * and nothing here flagged the drift).
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

    // M2 — and a migration on this connection leaves both exactly as they
    // are. `runInOneTransaction` turns foreign keys off for the length of the
    // transaction (a step may rebuild a table) and restores **the value it
    // found**, not a constant `ON`: restoring `ON` unconditionally overrode
    // `open.ts`'s deliberate `OFF` for the outbox, on every launch where a
    // migration happened to run, and nothing said so.
    migrateReplica(ledger.replica, { fs: realFs }).copy?.release();
    migrateOutbox(ledger.outbox, { fs: realFs }).copy?.release();

    expect(read(ledger.replica.db, "foreign_keys"), "the replica migrated, still ON").toEqual({
      foreign_keys: 1,
    });
    expect(read(ledger.outbox.db, "foreign_keys"), "the outbox migrated, still OFF").toEqual({
      foreign_keys: 0,
    });

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
