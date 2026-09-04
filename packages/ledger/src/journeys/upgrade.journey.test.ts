/**
 * Proves: architecture/14 §14.6 — an installed ledger upgrades in place, keeps every row, and
 * ends with the schema a fresh install has.
 * Findings: R2 C1-r3, R2 C2-r3, R3 C1-r4, R3 C2-r4, R3 H1-r4, R3 M2-r4, R3 M3-r4.
 *
 * **Every fixture under `fixtures/upgrade/` is loaded, not just `v1`.** The
 * chain on this branch is one version long, so today that is one pair — but
 * the scan is `readdirSync`, and a fixture a future PR adds for version 2
 * joins this suite with no edit here.
 *
 * **Loading a fixture is two steps, deliberately not one.** `REPLICA_MIGRATIONS`
 * and `OUTBOX_MIGRATIONS` build the tables; the fixture's own SQL is only
 * ever `INSERT`s (`fixture-dump.ts`'s whole argument). Running the chain up
 * to the fixture's version and then executing the SQL is exactly what
 * `createLocalLedgerSession` does to a real installed database — the same
 * migrator, the same two steps — which is what makes this a real upgrade
 * rather than a reconstruction of one.
 *
 * **What the "fresh equals upgraded" fingerprint proves today, honestly.**
 * With one chain version on this branch, every fixture is loaded *at* that
 * same version and `fresh` (`beforeAll`, below) is built by running that
 * same one-step chain from empty — so `schemaFingerprint` is comparing two
 * databases built by the identical migration, not a chain that actually ran
 * a fixture through a later step. This assertion gains real teeth only once
 * a second chain version exists and a fixture is upgraded across it; until
 * then, the signal that a fixture has drifted from what `dump-fixture.ts`
 * would produce today is the committed `INSERT` column lists themselves —
 * `pnpm --filter @waltning/ledger fixture:dump` regenerating a diff is what
 * actually catches drift, not this comparison.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COPY_SUFFIX, OUTBOX_MIGRATIONS, REPLICA_MIGRATIONS } from "../migrate.ts";
import type { LedgerPaths, SqliteOpener } from "../open.ts";
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

function sessionOptionsFor(paths: LedgerPaths): LocalLedgerSessionOptions<Run> {
  return {
    open: openWithBetterSqlite,
    paths,
    fs: nodeFs,
    removeDatabase: (path) => rmSync(path, { force: true }),
    bootstrapCurrencies: [],
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

function tableRowCounts(sqlite: Database.Database): Record<string, number> {
  const tables = sqlite
    .prepare(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`)
    .all() as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
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
 * Run the chain up to the fixture's version, then execute its SQL — the
 * "before" half of an upgrade. Nothing here calls `createLocalLedgerSession`;
 * that is each `it`'s job, so the fixture's own state is captured first.
 */
function loadFixture(pair: FixturePair): LoadedFixture {
  const { dir, paths } = newPaths("waltning-upgrade-fixture-");

  const replicaSql = readFileSync(pair.replicaPath, "utf8");
  const outboxSql = readFileSync(pair.outboxPath, "utf8");

  const replicaSteps = REPLICA_MIGRATIONS.filter((m) => m.version <= pair.version);
  const outboxSteps = OUTBOX_MIGRATIONS.filter((m) => m.version <= pair.version);
  if (replicaSteps.length === 0 || outboxSteps.length === 0) {
    throw new Error(
      `fixture v${pair.version} names a version this build's chain never passed through`,
    );
  }

  const replicaSqlite = new Database(paths.replica);
  const replicaDb = drizzle(replicaSqlite, { schema });
  for (const migration of replicaSteps) migration.up(replicaDb);
  replicaSqlite.exec(replicaSql);
  const replicaCountsBefore = tableRowCounts(replicaSqlite);
  const watermarkBefore = appliedSeqOf(replicaSqlite);
  replicaSqlite.close();

  const outboxSqlite = new Database(paths.outbox);
  const outboxDb = drizzle(outboxSqlite, { schema });
  for (const migration of outboxSteps) migration.up(outboxDb);
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
  const session = createLocalLedgerSession(sessionOptionsFor(paths));
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
      // files (a no-op here: the fixture is already at this chain's only
      // version) and then runs `recoverOnLaunch`, which is what applies the
      // pending entry Step 1 left above the watermark.
      const session = createLocalLedgerSession(sessionOptionsFor(fixture.paths));
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

        // The watermark is not reset — a forward schema migration at the
        // chain's current version "keeps `local_meta` untouched" (`migrate.ts`),
        // so it starts exactly where the fixture left it. It does not *stay*
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
   * is exactly the database a future migration that *does* fold names has to
   * cross without leaving a copy behind and the app unopened. On this branch
   * there is no such migration, so this passes trivially — the assertion is
   * here so the day a folded-name column lands, this file is what catches an
   * upgrade that takes the copy and then refuses (or hangs) on the collision.
   */
  it("leaves no `.pre-migration` copy behind once the session has opened", () => {
    const fixture = loadFixture(pair);
    try {
      const session = createLocalLedgerSession(sessionOptionsFor(fixture.paths));
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
