/**
 * Putting a backup back — the half that makes the other half a backup.
 *
 * `architecture/14` §14.3 ships the export as the phone's only durable copy
 * before a backend exists. An export nobody has restored is a hypothesis, and
 * the hypothesis is the expensive one to be wrong about: it is checked on the
 * day the original is already gone.
 *
 * ## It writes into empty stores, and refuses anything else
 *
 * A restore is not a merge. There is no second writer of record here and no
 * way to reconcile two ledgers that both think they are the ledger — so this
 * takes two stores that hold **nothing** and fills them, and refuses the
 * moment it finds a row. The caller that wants to replace a live ledger
 * deletes the files first, which is a decision with a confirmation attached
 * (`S30`), not something a restore does quietly on the way past.
 *
 * ## The schema version travels, and it is the whole ordering problem
 *
 * A document written at replica version 12 holds rows in *version 12's*
 * shape. Inserting them into a store migrated to 16 puts them through columns
 * that did not exist when they were written. So the stores are migrated to the
 * document's own version first, the rows go in, and the rest of the chain runs
 * over them — which is exactly what an app launch does to a database it has
 * not opened since an update, through the same `migrateReplica`.
 *
 * A document from a version this build does not have is refused rather than
 * guessed at, in `migrate.ts`'s own words: a build that does not recognise a
 * version must not decide what running its chain over it would do.
 *
## What "empty" means
 *
 * A migrated store is **not** an empty one. The chains seed three tables on
 * their way up: `local_meta`'s single watermark row, and `dashboard_layouts`
 * plus `dashboard_widgets` — `SPEC.md` §14.5's standing layout. Those rows are
 * the *migration's*, and the document carries the owner's own versions of all
 * three, including a watermark that matches the outbox travelling beside it.
 *
 * So the emptiness check looks past them, and each is cleared before its rows
 * go in. The first spelling of this refused every restore with *"these stores
 * already hold rows — dashboard_layouts (1)"*, which is the check reporting
 * the ledger it had just created.
 *
 * ## Foreign keys are deferred, not turned off
 *
 * Tables go in by name, and names do not sort into dependency order —
 * `accounts` references `currencies` and comes before it. Rather than hand-fix
 * an order that a new table would silently break, each store's rows go in
 * inside one transaction with `PRAGMA defer_foreign_keys = ON`: every
 * constraint is still checked, once, at commit. A restore whose references do
 * not resolve fails as a whole and writes nothing, which is the only useful
 * outcome — half a ledger is worse than none, because it looks like one.
 *
 * `foreign_keys = OFF` would have been the other spelling and is the wrong
 * one: it does not defer the checks, it *skips* them, and a backup is exactly
 * the file whose references nobody has verified.
 *
 * ## The outbox goes first
 *
 * `SPEC.md` §5.7's ordering, for its own reason rather than by analogy: the
 * outbox holds intent nothing else has. If a restore dies halfway, the half
 * worth having is the one that cannot be reconstructed from anywhere.
 */

import { type SQL, sql } from "drizzle-orm";
import {
  type LedgerFs,
  type Migration,
  migrateOutbox,
  migrateReplica,
  OUTBOX_MIGRATIONS,
  REPLICA_MIGRATIONS,
} from "../migrate.ts";
import type { LedgerSchema, OutboxStore, ReplicaStore } from "../open.ts";
import {
  type AnyStore,
  BACKUP_TABLES,
  type BackupDocument,
  type BackupRow,
  liveCounts,
} from "./document.ts";

/**
 * The tables this build's own migrations seed, which a restore replaces rather
 * than collides with. Named here rather than derived: a table that starts
 * carrying a seed later should have to be added on purpose, because the
 * question — *is this row the migration's or the owner's?* — has no mechanical
 * answer.
 */
const SEEDED = new Set(["local_meta", "dashboard_layouts", "dashboard_widgets"]);

export type RestoreStores<TRun, TSchema extends LedgerSchema> = {
  readonly replica: ReplicaStore<TRun, TSchema>;
  readonly outbox: OutboxStore<TRun, TSchema>;
};

export type RestoreOptions = {
  readonly fs: LedgerFs;
  /** The two chains, for a test that needs a build shorter than this one's. */
  readonly migrations?: {
    readonly replica?: readonly Migration[];
    readonly outbox?: readonly Migration[];
  };
};

export type RestoreResult = {
  /** Rows written per table — the figure the drill compares against the export's. */
  readonly counts: Readonly<Record<string, number>>;
  /** What the stores were migrated *to* afterwards, which is this build's head. */
  readonly schema: { readonly replica: number; readonly outbox: number };
};

export function restoreBackup<TRun, TSchema extends LedgerSchema>(
  stores: RestoreStores<TRun, TSchema>,
  backup: BackupDocument,
  options: RestoreOptions,
): RestoreResult {
  const replicaChain = options.migrations?.replica ?? REPLICA_MIGRATIONS;
  const outboxChain = options.migrations?.outbox ?? OUTBOX_MIGRATIONS;

  refuseAheadOfBuild(backup, replicaChain, outboxChain);

  // Up to the document's own version, so the rows meet the columns they were
  // written for — and no further yet.
  migrateOutbox(stores.outbox, {
    fs: options.fs,
    migrations: upTo(outboxChain, backup.schema.outbox),
  });
  migrateReplica(stores.replica, {
    fs: options.fs,
    migrations: upTo(replicaChain, backup.schema.replica),
  });

  refuseNonEmpty(stores);

  // The outbox first: it is the half nothing else holds.
  fill(stores.outbox.db, BACKUP_TABLES.outbox, backup.outbox);
  fill(stores.replica.db, BACKUP_TABLES.replica, backup.replica);

  // Then the rest of the chain, over rows that are now in the file — the same
  // thing a launch does to a database an update has moved past.
  const outbox = migrateOutbox(stores.outbox, { fs: options.fs, migrations: outboxChain });
  const replica = migrateReplica(stores.replica, { fs: options.fs, migrations: replicaChain });

  return {
    counts: liveCounts({ replica: stores.replica.db, outbox: stores.outbox.db }),
    schema: { replica: replica.to, outbox: outbox.to },
  };
}

/** The chain truncated to the version a document was written at. */
function upTo(chain: readonly Migration[], version: number): readonly Migration[] {
  return chain.filter((migration) => migration.version <= version);
}

function refuseAheadOfBuild(
  backup: BackupDocument,
  replicaChain: readonly Migration[],
  outboxChain: readonly Migration[],
): void {
  const head = (chain: readonly Migration[]) => chain[chain.length - 1]?.version ?? 0;
  for (const [half, found, current] of [
    ["replica", backup.schema.replica, head(replicaChain)],
    ["outbox", backup.schema.outbox, head(outboxChain)],
  ] as const) {
    if (found > current) {
      throw new Error(
        `restore: this backup's ${half} is at version ${found} and this build's chain ends at ${current} — it was written by a newer app. Install the newer build before restoring`,
      );
    }
    // A version between two steps is a chain this build does not have, which
    // is the same unknown as one ahead of it.
    const chain = half === "replica" ? replicaChain : outboxChain;
    if (found !== 0 && !chain.some((migration) => migration.version === found)) {
      throw new Error(
        `restore: this backup's ${half} is at version ${found}, which this build's chain does not contain`,
      );
    }
  }
}

/**
 * **A restore fills empty stores.** Not because merging is hard but because it
 * has no answer: two ledgers that both believe they are the ledger cannot be
 * reconciled without a writer of record, and there is none here (§14.0).
 */
function refuseNonEmpty<TRun, TSchema extends LedgerSchema>(
  stores: RestoreStores<TRun, TSchema>,
): void {
  const counts = liveCounts({ replica: stores.replica.db, outbox: stores.outbox.db });
  const held = Object.entries(counts).filter(([name, rows]) => rows > 0 && !SEEDED.has(name));
  if (held.length > 0) {
    const names = held.map(([name, rows]) => `${name} (${rows})`).join(", ");
    throw new Error(
      `restore: these stores already hold rows — ${names}. A restore fills an empty ledger; delete the files first`,
    );
  }
}

/**
 * Anything that can run a statement, by what its driver hands back.
 *
 * `TRun` rather than `unknown`: the two drivers return different results and
 * this module reads neither, which is a **type parameter's** job — `CLAUDE.md`
 * asks for one before `unknown`, precisely so the caller's type is not
 * discarded at the seam. A database and the transaction it opens both satisfy
 * it, which is what `fill` needs, since drizzle hands its callback an
 * `SQLiteTransaction` and not the database.
 */
type Writer<TRun> = { run: (query: SQL) => TRun };

/**
 * One store's tables, in one transaction, with its constraints checked at
 * commit rather than per row. See the header for why deferred and not off.
 */
function fill<TRun, TSchema extends LedgerSchema>(
  db: AnyStore<TRun, TSchema>,
  tables: readonly string[],
  rows: Readonly<Record<string, readonly BackupRow[]>>,
): void {
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    for (const name of tables) insertAll(tx, name, rows[name] ?? []);
  });
}

/**
 * One `INSERT` per row, with the columns the **document** carries.
 *
 * Not drizzle's typed insert: a document written by an older build has that
 * build's columns, and naming them from this build's schema object would
 * either drop one or invent one. The row's own keys are the truth — they came
 * from a `SELECT *` against the same table.
 *
 * **Identifiers through `sql.identifier`, values through the tag.** A table
 * name here came from this build's schema map and a column name from SQLite's
 * own answer, so neither is input — but the *values* are a restored file's,
 * and a file is exactly the thing an attacker gets to choose. Interpolating
 * them would make a backup an injection vector against the ledger it is
 * restoring into.
 */
function insertAll<TRun>(db: Writer<TRun>, table: string, rows: readonly BackupRow[]): void {
  // A seeded table holds the migration's rows; the document holds the
  // owner's. `local_meta`'s watermark in particular has to be the one that
  // matches the outbox arriving beside it, not the zero a fresh chain wrote.
  if (SEEDED.has(table)) db.run(sql`DELETE FROM ${sql.identifier(table)}`);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const names = sql.join(
      columns.map((column) => sql.identifier(column)),
      sql`, `,
    );
    const values = sql.join(
      columns.map((column) => sql`${row[column] ?? null}`),
      sql`, `,
    );
    db.run(sql`INSERT INTO ${sql.identifier(table)} (${names}) VALUES (${values})` as never);
  }
}
