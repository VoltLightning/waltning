/**
 * Proves: architecture/14 §14.6 — an installed ledger upgrades in place, keeps every row, and
 * ends with the schema a fresh install has.
 * Findings: R2 C1-r3, R2 C2-r3, R3 C1-r4, R3 C2-r4, R3 H1-r4, R3 M2-r4, R3 M3-r4.
 *
 * **Every fixture under `fixtures/upgrade/` is loaded.** The scan is
 * `readdirSync`, so a fixture a future PR adds joins this suite with no edit
 * here. Today that is `v8` — the ledger as it stood before `0008_schema`
 * rebuilt `transactions` — and `v9`, the current head.
 *
 * **Loading a fixture is two steps, deliberately not one.** `migrateReplica`
 * and `migrateOutbox` build the tables; the fixture's own SQL is only ever
 * `INSERT`s (`fixture-dump.ts`'s whole argument). Running the chain up to the
 * fixture's version and then executing the SQL is exactly what
 * `createLocalLedgerSession` does to a real installed database — the same
 * migrator, the same two steps — which is what makes this a real upgrade
 * rather than a reconstruction of one, and what gives the loaded file the
 * `__ledger_migrations` rows an installed app at that version would hold.
 *
 * **Each chain is cut at its own store's version (M1).** A pair is named by
 * the replica's number in both filenames, but each file states its own
 * store's version on its first line, and that is the one used: filtering the
 * outbox chain by the replica's number selected every outbox step there has
 * ever been, so no fixture could exercise an outbox migration at all.
 *
 * **What the "fresh equals upgraded" fingerprint proves, and where.** `v8` is
 * where it has teeth: that pair is loaded at a version below the chain's head,
 * so the session's own migrator runs a real step (`0008_schema`, a
 * copy-rename-drop rebuild of `transactions`) against real rows, and
 * `schemaFingerprint` then compares the result against a database built from
 * empty by the whole chain. `v9` sits at the head, so its upgrade is a no-op
 * and the comparison there is two identical builds — what that pair catches
 * instead is drift: a `fixture:dump` that no longer reproduces the committed
 * `INSERT` column lists.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LedgerDiagnosticEvent } from "../diagnostics.ts";
import {
  COPY_SUFFIX,
  MIGRATION_JOURNAL,
  type Migration,
  migrateOutbox,
  migrateReplica,
  OUTBOX_MIGRATIONS,
  REPLICA_MIGRATIONS,
} from "../migrate.ts";
import { type LedgerPaths, openLedger, type SqliteOpener } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { createLocalLedgerSession, type LocalLedgerSessionOptions } from "../session.ts";
import { nodeFs } from "../test/stores.ts";
import { type SchemaRow, schemaFingerprint } from "./schema-fingerprint.ts";

type Schema = typeof schema;
type Run = Database.RunResult;

const openWithBetterSqlite: SqliteOpener<Run, Schema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
};

function sessionOptionsFor(
  paths: LedgerPaths,
  preJournalStores: "rebuild" | "refuse",
): LocalLedgerSessionOptions<Run> {
  return {
    open: openWithBetterSqlite,
    paths,
    fs: nodeFs,
    removeDatabase: (path) => rmSync(path, { force: true }),
    bootstrapCurrencies: [],
    preJournalStores,
  };
}

function newPaths(prefix: string): { dir: string; paths: LedgerPaths } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, paths: { replica: join(dir, "replica.db"), outbox: join(dir, "outbox.db") } };
}

/** Open a file, read from it, close it — a connection that outlives nothing but the read. */
function inspect<T>(path: string, read: (db: Database.Database) => T): T {
  const sqlite = new Database(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

/**
 * Every table's row count — **except the migrator's own journal**, which is
 * not the ledger's data and is *supposed* to gain a row for every step an
 * upgrade runs. Counting it here would turn the property below ("no table
 * lost a row") into an assertion that no migration happened, which is the
 * opposite of what these fixtures exist to exercise. Its presence and shape
 * are covered instead by the fingerprint comparison against a fresh install,
 * and its contents by `test/migrate.test.ts`.
 */
function tableRowCounts(sqlite: Database.Database): Record<string, number> {
  const tables = sqlite
    .prepare(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`)
    .all() as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (name === MIGRATION_JOURNAL) continue;
    const [row] = sqlite.prepare(`select count(*) as n from "${name}"`).all() as { n: number }[];
    counts[name] = row?.n ?? 0;
  }
  return counts;
}

function appliedSeqOf(sqlite: Database.Database): number {
  const [row] = sqlite.prepare(`select applied_seq from local_meta where id = 1`).all() as {
    applied_seq?: number;
  }[];
  if (typeof row?.applied_seq !== "number") {
    throw new Error("local_meta holds no applied_seq — the replica was not migrated");
  }
  return row.applied_seq;
}

type OutboxRow = { id: string; seq: number; state: string };

function outboxRows(sqlite: Database.Database): OutboxRow[] {
  return sqlite.prepare(`select id, seq, state from outbox order by seq`).all() as OutboxRow[];
}

/** `outbox_seq`'s own counter — the last number `claimSeq` (`outbox.ts`) handed out. */
function outboxSeqIssuedOf(sqlite: Database.Database): number {
  const [row] = sqlite.prepare(`select issued from outbox_seq where id = 0`).all() as {
    issued?: number;
  }[];
  if (typeof row?.issued !== "number") {
    throw new Error("outbox_seq holds no issued counter for this fixture");
  }
  return row.issued;
}

/** The highest `seq` any row in this fixture's `outbox` actually carries. */
function maxOutboxSeqOf(sqlite: Database.Database): number {
  const [row] = sqlite.prepare(`select coalesce(max(seq), 0) as m from outbox`).all() as {
    m: number;
  }[];
  return row?.m ?? 0;
}

/* ── fixture discovery ────────────────────────────────────────────────────── */

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/upgrade/", import.meta.url));

/**
 * The version a fixture file states **about its own store**, off its first
 * line — `dumpDatabase` writes `PRAGMA user_version = N;` there by reading it
 * out of the database rather than being told.
 *
 * **M1.** Both chains used to be filtered by the number in the *filename*,
 * which is the replica's version in both names by convention (this file's
 * header, and `fixtures/upgrade/README.md`). The outbox's own chain ends at 2
 * and every fixture's name carries a number far above that, so
 * `version <= pair.version` selected the whole outbox chain every time: the
 * outbox was always built to head, and no fixture could ever exercise an
 * outbox migration however many were added. Each store's chain is filtered by
 * its own store's number now, which is the only number that means anything
 * about it.
 */
function statedVersion(path: string): number {
  const [line] = readFileSync(path, "utf8").split("\n");
  const stated = /^PRAGMA user_version = (\d+);$/.exec(line ?? "")?.[1];
  if (stated === undefined) {
    throw new Error(`${path} does not begin with its own \`PRAGMA user_version\` line`);
  }
  return Number(stated);
}

type FixturePair = { version: number; replicaPath: string; outboxPath: string };

/**
 * Every `replica-v<N>.sql` in the directory, paired with its `outbox-v<N>.sql`.
 *
 * `readdirSync`, and it throws on an empty directory rather than returning
 * one — a suite built from `for (const pair of [])` would report every `it`
 * below as passing by running none of them.
 */
function fixturePairs(): FixturePair[] {
  const entries = readdirSync(FIXTURES_DIR);
  if (entries.length === 0) {
    throw new Error(`${FIXTURES_DIR} is empty — nothing to upgrade`);
  }

  const pairs: FixturePair[] = [];
  for (const entry of entries) {
    const match = /^replica-v(\d+)\.sql$/.exec(entry);
    if (!match) continue;
    const versionText = match[1];
    if (versionText === undefined) continue;
    const version = Number(versionText);
    const outboxName = `outbox-v${version}.sql`;
    if (!entries.includes(outboxName)) {
      throw new Error(`fixtures/upgrade/${entry} has no matching ${outboxName}`);
    }
    pairs.push({
      version,
      replicaPath: join(FIXTURES_DIR, entry),
      outboxPath: join(FIXTURES_DIR, outboxName),
    });
  }

  if (pairs.length === 0) {
    throw new Error(`${FIXTURES_DIR} holds no replica-v*.sql fixture`);
  }
  return pairs;
}

const PAIRS = fixturePairs();

/* ── loading a fixture into a fresh pair of files ────────────────────────── */

type LoadedFixture = {
  dir: string;
  paths: LedgerPaths;
  /** Every table's row count, read right after the fixture's SQL landed — before any upgrade. */
  replicaCountsBefore: Record<string, number>;
  outboxCountsBefore: Record<string, number>;
  watermarkBefore: number;
  /** Outbox rows whose `seq` was already above the watermark — what recovery must replay. */
  pendingBefore: OutboxRow[];
  /** `outbox_seq.issued` and the highest `outbox.seq` present, both read before any upgrade runs. */
  outboxSeqIssuedBefore: number;
  maxOutboxSeqBefore: number;
  cleanup: () => void;
};

/**
 * Run each store's chain up to the version **that store's own file states**,
 * then execute its SQL — the "before" half of an upgrade. Nothing here calls
 * `createLocalLedgerSession`; that is each `it`'s job, so the fixture's own
 * state is captured first.
 *
 * **The chain runs through the real migrator, not through `up` directly.**
 * `migrateReplica`/`migrateOutbox` are what create `__ledger_migrations` and
 * record what they ran — so a database built here is the shape an installed
 * app at that version actually has, journal included, rather than one missing
 * the very record the next launch reads. Applying the steps by hand produced
 * a file the session then refused, correctly, as written by a pre-journal
 * build.
 */
function loadFixture(pair: FixturePair): LoadedFixture {
  const { dir, paths } = newPaths("waltning-upgrade-fixture-");

  const replicaSql = readFileSync(pair.replicaPath, "utf8");
  const outboxSql = readFileSync(pair.outboxPath, "utf8");

  const replicaVersion = statedVersion(pair.replicaPath);
  const outboxVersion = statedVersion(pair.outboxPath);
  if (replicaVersion !== pair.version) {
    throw new Error(
      `replica-v${pair.version}.sql states version ${replicaVersion} — a pair is named by the replica's own version, in both filenames`,
    );
  }

  const replicaSteps = REPLICA_MIGRATIONS.filter((m) => m.version <= replicaVersion);
  const outboxSteps = OUTBOX_MIGRATIONS.filter((m) => m.version <= outboxVersion);
  if (replicaSteps.length === 0 || outboxSteps.length === 0) {
    throw new Error(
      `fixture v${pair.version} (replica ${replicaVersion}, outbox ${outboxVersion}) names a version this build's chain never passed through`,
    );
  }

  const atVersion = openLedger(openWithBetterSqlite, paths);
  try {
    migrateReplica(atVersion.replica, { fs: nodeFs, migrations: replicaSteps }).copy?.release();
    migrateOutbox(atVersion.outbox, { fs: nodeFs, migrations: outboxSteps }).copy?.release();
  } finally {
    atVersion.close();
  }

  const replicaSqlite = new Database(paths.replica);
  replicaSqlite.exec(replicaSql);
  const replicaCountsBefore = tableRowCounts(replicaSqlite);
  const watermarkBefore = appliedSeqOf(replicaSqlite);
  replicaSqlite.close();

  const outboxSqlite = new Database(paths.outbox);
  outboxSqlite.exec(outboxSql);
  const outboxCountsBefore = tableRowCounts(outboxSqlite);
  const pendingBefore = outboxRows(outboxSqlite).filter((row) => row.seq > watermarkBefore);
  const outboxSeqIssuedBefore = outboxSeqIssuedOf(outboxSqlite);
  const maxOutboxSeqBefore = maxOutboxSeqOf(outboxSqlite);
  outboxSqlite.close();

  return {
    dir,
    paths,
    replicaCountsBefore,
    outboxCountsBefore,
    watermarkBefore,
    pendingBefore,
    outboxSeqIssuedBefore,
    maxOutboxSeqBefore,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/* ── the fresh install every fixture's upgraded schema is compared against ── */

let fresh: {
  replicaFingerprint: SchemaRow[];
  outboxFingerprint: SchemaRow[];
  cleanup: () => void;
};

beforeAll(() => {
  const { dir, paths } = newPaths("waltning-upgrade-fresh-");
  const session = createLocalLedgerSession(sessionOptionsFor(paths, "refuse"));
  session.close();

  fresh = {
    replicaFingerprint: inspect(paths.replica, schemaFingerprint),
    outboxFingerprint: inspect(paths.outbox, schemaFingerprint),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
});

afterAll(() => {
  fresh.cleanup();
});

/* ── the journey ──────────────────────────────────────────────────────────── */

describe.each(PAIRS)("upgrading from replica-v$version / outbox-v$version", (pair) => {
  it("upgrades in place: no throw, every row kept, the pending entry replayed, watermark caught up, schema matching a fresh install", () => {
    const fixture = loadFixture(pair);
    try {
      // The upgrade + recovery — `createLocalLedgerSession` migrates both
      // files (every step this fixture's version is behind the chain head,
      // in place) and then runs `recoverOnLaunch`, which is what applies the
      // pending entry Step 1 left above the watermark.
      const session = createLocalLedgerSession(sessionOptionsFor(fixture.paths, "refuse"));
      try {
        const replicaCountsAfter = inspect(fixture.paths.replica, tableRowCounts);
        const outboxCountsAfter = inspect(fixture.paths.outbox, tableRowCounts);
        const watermarkAfter = inspect(fixture.paths.replica, appliedSeqOf);
        const outboxAfter = inspect(fixture.paths.outbox, outboxRows);

        // No table lost a row. `transactions` is the one exception, and by
        // exactly the number of entries recovery replayed — everything Step 1
        // wrote is still there, plus what recovery added on top.
        for (const [table, before] of Object.entries(fixture.replicaCountsBefore)) {
          const after = replicaCountsAfter[table];
          const expected =
            table === "transactions" ? before + fixture.pendingBefore.length : before;
          expect(after, `${table}'s row count after the upgrade`).toBe(expected);
        }
        expect(Object.keys(replicaCountsAfter).sort()).toEqual(
          Object.keys(fixture.replicaCountsBefore).sort(),
        );

        // Recovery never adds or removes an outbox row — only a `sending`
        // entry's state would move, and nothing here was left `sending`.
        expect(outboxCountsAfter).toEqual(fixture.outboxCountsBefore);

        // The watermark is not reset — a forward schema migration "keeps
        // `local_meta` untouched" (`migrate.ts`), so it starts exactly where
        // the fixture left it, however many steps ran. It does not *stay*
        // there: recovery replays everything above it, and the watermark
        // catches up by precisely that many entries — the replay this
        // fixture exists to exercise, not a no-op.
        expect(watermarkAfter).toBe(fixture.watermarkBefore + fixture.pendingBefore.length);

        // Every entry that was above the watermark is still `pending` —
        // recovery applies an entry's *effect*; it does not relabel the row
        // (`recover.ts`'s `haltAt` is the only path that touches `state`, and
        // only on a halt).
        for (const before of fixture.pendingBefore) {
          const after = outboxAfter.find((row) => row.id === before.id);
          expect(after?.state, `entry ${before.id}'s state after replay`).toBe("pending");
        }

        // The schema an upgraded database ends with is the schema a fresh
        // install gets — the second half of what `architecture/14` §14.6 asks
        // for, and the reason `schemaFingerprint` reads pragmas back rather
        // than trusting the chain that built both databases.
        expect(inspect(fixture.paths.replica, schemaFingerprint)).toEqual(fresh.replicaFingerprint);
        expect(inspect(fixture.paths.outbox, schemaFingerprint)).toEqual(fresh.outboxFingerprint);
      } finally {
        session.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  /**
   * R2 C2-r3 / R3 C2-r4's teeth: a fixture carrying `Łukasz Placeholder` and
   * `łukasz placeholder` — two rows the ASCII-only fold does not see as one —
   * is exactly the database a migration that *does* fold names has to cross
   * without leaving a copy behind and the app unopened. Both fixtures carry
   * the pair with one row archived by the merge they also carry, which is the
   * case `migrate.ts`'s `0006_schema` precondition must *allow*
   * (`counterparties_name_uq` is partial); the case it must refuse — both rows
   * live — is `test/migrate.test.ts`'s, since no fixture can sit at a version
   * below the one that folds them and still be dumped by the current tool.
   */
  it("leaves no `.pre-migration` copy behind once the session has opened", () => {
    const fixture = loadFixture(pair);
    try {
      const session = createLocalLedgerSession(sessionOptionsFor(fixture.paths, "refuse"));
      try {
        expect(existsSync(`${fixture.paths.replica}${COPY_SUFFIX}`)).toBe(false);
        expect(existsSync(`${fixture.paths.outbox}${COPY_SUFFIX}`)).toBe(false);
      } finally {
        session.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  /**
   * M2's own guard: `outbox_seq.issued` (`outbox.ts`'s `claimSeq` counter) must
   * never sit below the highest `seq` a fixture's own `outbox` rows carry —
   * that state is what `claimSeq` calls fatal the moment a real write claims
   * the next number and reuses one already on a row (`outbox.ts`'s own
   * header). Checked against the fixture's SQL as committed, before any
   * upgrade runs, so a future `fixture:dump` that regresses this is caught
   * here rather than by the reused-seq failure it would otherwise cause much
   * later, mid-replay.
   */
  it("outbox_seq.issued was claimed for every row this fixture's own SQL wrote — never a reused seq", () => {
    const fixture = loadFixture(pair);
    try {
      expect(
        fixture.maxOutboxSeqBefore,
        `outbox-v${pair.version}.sql's highest outbox.seq against its own outbox_seq.issued`,
      ).toBeLessThanOrEqual(fixture.outboxSeqIssuedBefore);
    } finally {
      fixture.cleanup();
    }
  });
});

/* ── a store written before the journal ──────────────────────────────────── */

/** `openLedger` over a fresh pair of paths this suite made — the whole `Ledger`, not one connection. */
function openRaw(paths: LedgerPaths) {
  return openLedger(openWithBetterSqlite, paths);
}

type RawLedger = ReturnType<typeof openRaw>;

/**
 * The pre-journal shape: every step's statements ran, `user_version` stamped,
 * but no `__ledger_migrations` — because `runInOneTransaction` is the only
 * thing that writes that table, and nothing here goes near it. Mirrors
 * `test/migrate.test.ts`'s `seedPreJournalReplica`, over a `Ledger` this file
 * builds with `openLedger` rather than a bare connection.
 */
function seedPreJournalReplica(ledger: RawLedger, stampedVersion: number): void {
  for (const migration of REPLICA_MIGRATIONS) migration.up(ledger.replica.db);
  ledger.replica.db.run(sql.raw(`pragma user_version = ${stampedVersion}`));
}

/** The outbox's own pre-journal shape — the same construction, the other chain. */
function seedPreJournalOutbox(ledger: RawLedger, stampedVersion: number): void {
  for (const migration of OUTBOX_MIGRATIONS) migration.up(ledger.outbox.db);
  ledger.outbox.db.run(sql.raw(`pragma user_version = ${stampedVersion}`));
}

/**
 * One account row, as raw SQL rather than a typed insert — the replica this
 * runs against was built by `seedPreJournalReplica`, never through a session,
 * so no currency has been bootstrapped for a typed insert's foreign key to
 * find. Placeholder values only, per `docs/agents/domain.md`'s public-repo rule.
 */
function insertPreJournalAccount(ledger: RawLedger, accountId: string): void {
  const now = Date.now();
  ledger.replica.db.run(
    sql`insert into "currencies" ("code", "name", "updated_at") values ('PLN', 'Placeholder', ${now})`,
  );
  ledger.replica.db.run(
    sql`insert into "accounts" ("id", "name", "currency", "created_at", "updated_at") values (${accountId}, 'Bank A · PLN', 'PLN', ${now}, ${now})`,
  );
}

/** The same row, through the typed schema — for a replica already migrated for real. */
function seedAccount(db: RawLedger["replica"]["db"], accountId: string): void {
  db.insert(schema.currencies)
    .values({ code: currencyCode("PLN"), name: "Placeholder" })
    .onConflictDoNothing()
    .run();
  db.insert(schema.accounts)
    .values({
      id: id<"accounts">(accountId),
      name: "Bank A · PLN",
      currency: currencyCode("PLN"),
    })
    .onConflictDoNothing()
    .run();
}

/** Every tag `__ledger_migrations` holds, for comparing against a chain's full tag set. */
function journalTags(db: Database.Database): string[] {
  return (
    db.prepare(`select "tag" from "${MIGRATION_JOURNAL}" order by "tag"`).all() as {
      tag: string;
    }[]
  ).map((row) => row.tag);
}

function userVersionOf(db: Database.Database): number {
  const row = db.prepare("pragma user_version").get() as { user_version: number };
  return row.user_version;
}

/** The version a fully-migrated store ends at — the chain's own highest step. */
function headVersion(migrations: readonly Migration[]): number {
  return Math.max(...migrations.map((m) => m.version));
}

/**
 * The owner's ruling — every current database is disposable until first
 * install (`architecture/08` item 1; `architecture/14` §14.6) — proved
 * end to end: a pre-journal store makes `createLocalLedgerSession` rebuild
 * the pair rather than throw, and the rebuilt pair is indistinguishable from
 * a fresh install.
 */
describe("a store written before the journal", () => {
  it("rebuilds the pair from nothing: fresh files, full journal, the rebuild diagnostic names the store", () => {
    const { dir, paths } = newPaths("waltning-prejournal-pair-");
    try {
      const raw = openRaw(paths);
      // Only the replica is seeded pre-journal; the outbox is left exactly as
      // `openLedger` created it — a fresh file at version 0 — which is what
      // makes `migrateOutbox` (run first, inside `start`) succeed before
      // `migrateReplica` reaches the pre-journal refusal.
      seedPreJournalReplica(raw, 1);
      insertPreJournalAccount(raw, "acc-pre-journal");
      // The seed actually landed — otherwise "the row is gone" below would
      // be true for the wrong reason.
      expect(raw.replica.db.select().from(schema.accounts).all()).toHaveLength(1);
      raw.close();

      const events: LedgerDiagnosticEvent[] = [];
      const session = createLocalLedgerSession({
        ...sessionOptionsFor(paths, "rebuild"),
        diagnostics: (event) => events.push(event),
      });
      try {
        expect(
          session.listAccounts(),
          "the pre-journal row is gone — the rebuild started from nothing",
        ).toEqual([]);

        expect(inspect(paths.replica, journalTags).sort()).toEqual(
          REPLICA_MIGRATIONS.map((m) => m.tag).sort(),
        );
        expect(inspect(paths.outbox, journalTags).sort()).toEqual(
          OUTBOX_MIGRATIONS.map((m) => m.tag).sort(),
        );
        expect(inspect(paths.replica, userVersionOf)).toBe(headVersion(REPLICA_MIGRATIONS));
        expect(inspect(paths.outbox, userVersionOf)).toBe(headVersion(OUTBOX_MIGRATIONS));

        const rebuilds = events.filter((event) => event.phase === "rebuild");
        expect(rebuilds).toHaveLength(1);
        expect(rebuilds[0]?.store).toBe("replica");

        expect(existsSync(`${paths.replica}${COPY_SUFFIX}`)).toBe(false);
        expect(existsSync(`${paths.outbox}${COPY_SUFFIX}`)).toBe(false);
      } finally {
        session.close();
      }

      // No `-wal`/`-shm` litter once the rebuilt pair has closed cleanly —
      // proof `removeStorePair` took the pre-journal pair's own siblings with
      // it rather than leaving them for the rebuilt files to inherit.
      for (const path of [paths.replica, paths.outbox]) {
        expect(existsSync(`${path}-wal`)).toBe(false);
        expect(existsSync(`${path}-shm`)).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a pre-journal outbox beside a journaled replica rebuilds both", () => {
    const { dir, paths } = newPaths("waltning-prejournal-outbox-");
    try {
      const raw = openRaw(paths);
      // The replica this time is built through the real migrator — a proper,
      // journaled store, the shape an installed app actually has — and holds
      // a row of its own, so its loss is the thing under test.
      migrateReplica(raw.replica, { fs: nodeFs }).copy?.release();
      seedAccount(raw.replica.db, "acc-real");
      expect(raw.replica.db.select().from(schema.accounts).all()).toHaveLength(1);
      seedPreJournalOutbox(raw, 1);
      raw.close();

      const events: LedgerDiagnosticEvent[] = [];
      const session = createLocalLedgerSession({
        ...sessionOptionsFor(paths, "rebuild"),
        diagnostics: (event) => events.push(event),
      });
      try {
        expect(
          session.listAccounts(),
          "the journaled replica's own row is gone too — the pair rebuilds together, never one side alone",
        ).toEqual([]);

        const rebuilds = events.filter((event) => event.phase === "rebuild");
        expect(rebuilds).toHaveLength(1);
        expect(rebuilds[0]?.store).toBe("outbox");
      } finally {
        session.close();
      }

      for (const path of [paths.replica, paths.outbox]) {
        expect(existsSync(`${path}-wal`)).toBe(false);
        expect(existsSync(`${path}-shm`)).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The other refusal stays a refusal. `PreJournalStoreError` is the one
   * class `session.ts` rebuilds on — a checksum mismatch is a plain `Error`,
   * so it must still stop the app rather than erase a database whose only
   * fault is disagreeing with this build about one step's statements.
   */
  it("a checksum mismatch is still a refusal, not a rebuild", () => {
    const { dir, paths } = newPaths("waltning-checksum-mismatch-");
    try {
      const setupSession = createLocalLedgerSession(sessionOptionsFor(paths, "refuse"));
      setupSession.close();

      const versionBefore = inspect(paths.replica, userVersionOf);
      const firstTag = REPLICA_MIGRATIONS[0]?.tag;
      if (firstTag === undefined) throw new Error("REPLICA_MIGRATIONS is empty");

      const sqlite = new Database(paths.replica);
      try {
        sqlite
          .prepare(
            `update "${MIGRATION_JOURNAL}" set "checksum" = 'bogus-checksum' where "tag" = ?`,
          )
          .run(firstTag);
      } finally {
        sqlite.close();
      }

      const events: LedgerDiagnosticEvent[] = [];
      expect(() =>
        createLocalLedgerSession({
          ...sessionOptionsFor(paths, "refuse"),
          diagnostics: (event) => events.push(event),
        }),
      ).toThrow(/is not the one that ran here/);

      expect(events.filter((event) => event.phase === "rebuild")).toHaveLength(0);
      expect(inspect(paths.replica, userVersionOf)).toBe(versionBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * C-2's opt-out. Both stores are pre-journal here, deliberately — the
   * outbox is checked first inside `start`, so it is the one that refuses
   * and `migrateReplica` never runs at all, which is what makes "both files
   * intact at their versions" a claim this test can actually make rather
   * than one true only of whichever store happened to be checked second.
   */
  it("in refuse mode a pre-journal pair is refused, nothing deleted", () => {
    const { dir, paths } = newPaths("waltning-prejournal-refuse-");
    try {
      const raw = openRaw(paths);
      seedPreJournalReplica(raw, 1);
      insertPreJournalAccount(raw, "acc-pre-journal");
      expect(raw.replica.db.select().from(schema.accounts).all()).toHaveLength(1);
      seedPreJournalOutbox(raw, 1);
      raw.close();

      const replicaVersionBefore = inspect(paths.replica, userVersionOf);
      const outboxVersionBefore = inspect(paths.outbox, userVersionOf);

      const events: LedgerDiagnosticEvent[] = [];
      expect(() =>
        createLocalLedgerSession({
          ...sessionOptionsFor(paths, "refuse"),
          diagnostics: (event) => events.push(event),
        }),
      ).toThrow(/delete/);

      expect(events.filter((event) => event.phase === "rebuild")).toHaveLength(0);
      expect(existsSync(paths.replica), "the replica file itself still exists").toBe(true);
      expect(existsSync(paths.outbox), "the outbox file itself still exists").toBe(true);
      expect(inspect(paths.replica, userVersionOf)).toBe(replicaVersionBefore);
      expect(inspect(paths.outbox, userVersionOf)).toBe(outboxVersionBefore);
      expect(
        inspect(
          paths.replica,
          (db) => (db.prepare('select count(*) as n from "accounts"').get() as { n: number }).n,
        ),
        "the seeded row was never touched, let alone deleted",
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * A rebuild that cannot even delete the pair must not vanish into an
   * unrelated throw with nothing logged — `removeStorePair`'s own failure
   * is wrapped and reported, and the `PreJournalStoreError` that started
   * the rebuild rides along as `cause` rather than being lost.
   */
  it("a rebuild that cannot delete the pair emits a failure diagnostic with the original error as cause", () => {
    const { dir, paths } = newPaths("waltning-prejournal-delete-fails-");
    try {
      const raw = openRaw(paths);
      seedPreJournalReplica(raw, 1);
      raw.close();

      const events: LedgerDiagnosticEvent[] = [];
      expect(() =>
        createLocalLedgerSession({
          ...sessionOptionsFor(paths, "rebuild"),
          removeDatabase: (path) => {
            if (path === paths.replica) throw new Error("disk is full");
          },
          diagnostics: (event) => events.push(event),
        }),
      ).toThrow(/the pre-journal rebuild could not delete the pair: disk is full/);

      const rebuilds = events.filter((event) => event.phase === "rebuild");
      expect(rebuilds, "the rebuild was still attempted and logged").toHaveLength(1);

      const failure = events.find((event) => event.phase === "failure");
      expect(failure?.error.message).toMatch(/could not delete the pair/);
      expect(
        failure?.error.cause?.name,
        "the original PreJournalStoreError rides along as cause",
      ).toBe("PreJournalStoreError");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
