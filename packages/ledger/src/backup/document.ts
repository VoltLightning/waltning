/**
 * The whole ledger, as one backup — what an export encrypts and a restore
 * replays.
 *
 * `architecture/14` §14.3 makes this the *only* durable copy until a backend
 * exists, so the shape is chosen for the day it is used rather than the day it
 * is written. Three consequences:
 *
 * **It is JSON, not a copy of the database files.** A SQLite file is smaller
 * and needs no per-table code, and is the wrong answer here: `age -d` on a
 * decrypted backup should leave a person holding something they can read,
 * grep and re-enter by hand if every other path has failed. A restore is the
 * moment when the thing you most need is for the format not to require a
 * working copy of the program that wrote it.
 *
 * **Both stores travel, and the outbox is not optional.** `SPEC.md` §5.7 keeps
 * `replica.db` and `outbox.db` as separate files; on a phone with no backend
 * the outbox is unsent *intent that nothing else holds*, so a backup of the
 * replica alone silently discards every capture the server has not seen. The
 * backup keeps them apart, because the restore writes two files.
 *
 * **Every table in the schema map is named, and the test asserts that.** The
 * failure this guards is the quiet one: a table added later, a writer that
 * enumerates a hand-maintained list, and an export that is complete right up
 * until the release that added `brand_aliases`. `TABLES` below is derived from
 * `ledgerSchema` itself, and `document.test.ts` breaks if the two ever differ.
 *
 * **The schema version is recorded, and a restore refuses to guess.** A
 * backup written by a newer build may hold columns this one has never seen;
 * the migrators already refuse a database from the future for that reason
 * (`migrate.ts`), and a backup earns the same refusal rather than a partial
 * restore that looks like a success.
 */

import { getTableName, is, sql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { MIGRATION_JOURNAL } from "../migrate.ts";
import type { LedgerSchema, OutboxDb, ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

/** The backup's own format version — bumped when the *shape below* changes, never on a schema migration. */
export const BACKUP_FORMAT = 1;

/** The two tables that live in `outbox.db`. Everything else in the map is the replica's. */
const OUTBOX_TABLES = ["outbox", "outbox_seq"] as const;

/**
 * The migrator's own journal (`MIGRATION_JOURNAL`) is in neither file's export
 * and is the one omission on purpose: it is a record of how *this* file was
 * built, and a restore builds a new one by running the chain. Carrying it
 * would hand the new database another database's history — the one thing that
 * would make `migrate.ts`'s "a version it does not recognise is an error"
 * fire on a file this app just wrote.
 *
 * It is absent from the schema map, so nothing has to exclude it; the export
 * test asserts it against SQLite's own catalogue so the omission stays
 * deliberate rather than becoming a gap nobody rechecked.
 */

/**
 * SQLite table names, taken from the schema map so a new table cannot be
 * forgotten.
 *
 * `is` and `getTableName` are drizzle's own: a table object carries its columns
 * under ordinary keys, so reading a `name` property would happily return a
 * *column* called `name` and the export would ship a table called whatever
 * that column's name happened to be.
 */
function tableNames(): { replica: string[]; outbox: string[] } {
  const all = Object.values(ledgerSchema)
    .filter((table) => is(table, SQLiteTable))
    .map(getTableName)
    .sort();
  const outbox = all.filter((name) => (OUTBOX_TABLES as readonly string[]).includes(name));
  return { replica: all.filter((name) => !outbox.includes(name)), outbox };
}

export const BACKUP_TABLES = tableNames();

/** A row as it travels: column name to value, exactly as SQLite returned it. */
export type BackupRow = Record<string, string | number | null>;

export type BackupDocument = {
  /** The literal `"waltning-ledger"`, so a wrong file is named as one before anything is parsed. */
  readonly kind: "waltning-ledger";
  readonly format: number;
  /** When the export ran, in UTC. Not an accounting date — this one is a timestamp. */
  readonly createdAt: string;
  /** `PRAGMA user_version` of each store, so a restore can refuse a backup from a newer build. */
  readonly schema: { readonly replica: number; readonly outbox: number };
  /** Which key opens this file, restated in the plaintext so a restore can say *this is not yours*. */
  readonly recipient: string;
  /** Row counts per table, written before the rows and checked against them on restore. */
  readonly counts: Readonly<Record<string, number>>;
  readonly replica: Readonly<Record<string, readonly BackupRow[]>>;
  readonly outbox: Readonly<Record<string, readonly BackupRow[]>>;
};

export type ReadStores<TRun, TSchema extends LedgerSchema> = {
  readonly replica: ReplicaDb<TRun, TSchema>;
  readonly outbox: OutboxDb<TRun, TSchema>;
};

/**
 * Reads both stores into one document.
 *
 * `SELECT *` per table rather than drizzle's typed readers: the backup must
 * carry every column the *file* has, including one this build's schema object
 * does not know about because the file was written by a newer app. A typed
 * read would silently drop it, and the backup would be the one place that
 * loses data no other path loses.
 */
/**
 * `SELECT count(*)` per table, read straight from both files.
 *
 * Deliberately a **second, independent** read rather than a length taken off
 * the rows that were serialised: `export.ts` compares these against what comes
 * back out of the ciphertext, and a comparison against the same array the
 * document was built from proves the JSON round-tripped and nothing more —
 * which the AEAD tag already proved. This is the only figure in the check that
 * did not pass through the writer.
 */
export function liveCounts<TRun, TSchema extends LedgerSchema>(
  stores: ReadStores<TRun, TSchema>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of BACKUP_TABLES.replica) counts[name] = countRows(stores.replica, name);
  for (const name of BACKUP_TABLES.outbox) counts[name] = countRows(stores.outbox, name);
  return counts;
}

function countRows<TRun, TSchema extends LedgerSchema>(
  db: AnyStore<TRun, TSchema>,
  name: string,
): number {
  const rows = db.all<{ rows?: number }>(sql.raw(`SELECT count(*) AS rows FROM "${name}"`));
  const rowCount = Array.isArray(rows) ? rows[0]?.rows : undefined;
  // An aggregate always returns its row. No row is a broken read, and `0` here
  // would silently agree with an export that lost the whole table.
  if (typeof rowCount !== "number") throw new Error(`backup: could not count ${name}`);
  return rowCount;
}

/**
 * Every table the *files* hold, from SQLite's own catalogue.
 *
 * `BACKUP_TABLES` comes from this build's schema map, so a table written by a
 * newer app is in the file and not in the map — and would be dropped from the
 * export with nothing saying so. This is what notices.
 */
export function liveTables<TRun, TSchema extends LedgerSchema>(
  stores: ReadStores<TRun, TSchema>,
): string[] {
  const of = (db: AnyStore<TRun, TSchema>) =>
    db
      .all<{ name?: string }>(
        sql.raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
      )
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string")
      // The migrator's journal is not a data table; the header says why.
      .filter((name) => name !== MIGRATION_JOURNAL);
  return [...of(stores.replica), ...of(stores.outbox)].sort();
}

export function readBackup<TRun, TSchema extends LedgerSchema>(
  stores: ReadStores<TRun, TSchema>,
  options: { readonly recipient: string; readonly now: Date },
): BackupDocument {
  const counts: Record<string, number> = {};
  const replica: Record<string, BackupRow[]> = {};
  const outbox: Record<string, BackupRow[]> = {};

  for (const name of BACKUP_TABLES.replica) {
    const rows = readTable(stores.replica, name);
    replica[name] = rows;
    counts[name] = rows.length;
  }
  for (const name of BACKUP_TABLES.outbox) {
    const rows = readTable(stores.outbox, name);
    outbox[name] = rows;
    counts[name] = rows.length;
  }

  return {
    kind: "waltning-ledger",
    format: BACKUP_FORMAT,
    createdAt: options.now.toISOString(),
    schema: {
      replica: readUserVersion(stores.replica),
      outbox: readUserVersion(stores.outbox),
    },
    recipient: options.recipient,
    counts,
    replica,
    outbox,
  };
}

/** Either store, for the two readers below — both only ever call `all`. */
type AnyStore<TRun, TSchema extends LedgerSchema> =
  | ReplicaDb<TRun, TSchema>
  | OutboxDb<TRun, TSchema>;

function readTable<TRun, TSchema extends LedgerSchema>(
  db: AnyStore<TRun, TSchema>,
  name: string,
): BackupRow[] {
  // `sql.raw` on a name that came from the schema map, never from input.
  const rows = db.all<BackupRow>(sql.raw(`SELECT * FROM "${name}"`));
  if (!Array.isArray(rows)) throw new Error(`backup: reading ${name} returned no rows array`);
  return rows;
}

function readUserVersion<TRun, TSchema extends LedgerSchema>(db: AnyStore<TRun, TSchema>): number {
  const rows = db.all<{ user_version?: number }>(sql.raw("PRAGMA user_version"));
  const version = Array.isArray(rows) ? rows[0]?.user_version : undefined;
  // A pragma always answers. No row is a broken read, and defaulting to 0
  // would restore a current ledger as though it were a fresh one.
  if (typeof version !== "number") throw new Error("backup: could not read the schema version");
  return version;
}

/** The backup as bytes, ready to encrypt. Pretty-printed, because someone will read it. */
export function serialiseBackup(backup: BackupDocument): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(backup, null, 1)}\n`);
}

/**
 * The backup back from bytes, with every claim it makes about itself checked
 * before a caller can act on it.
 *
 * Rule 0 on clients (`CLAUDE.md`): authenticate the response before trusting
 * its status. The bytes have already been authenticated by age's tag, so what
 * is left is whether they are a *ledger* — and the honest answers to "this is
 * a photo", "this is a newer app's backup" and "this is half a file" are three
 * different sentences.
 */
export function parseBackup(
  bytes: Uint8Array,
  atMost: { readonly format: number },
): BackupDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("backup: this file decrypted, but it is not a ledger backup");
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("backup: not a backup");
  const backup = parsed as Partial<BackupDocument>;

  if (backup.kind !== "waltning-ledger") {
    throw new Error("backup: this is not a waltning ledger export");
  }
  if (typeof backup.format !== "number" || backup.format > atMost.format) {
    throw new Error(
      `backup: written by a newer app (format ${String(backup.format)}) — install it before restoring`,
    );
  }
  for (const half of ["replica", "outbox"] as const) {
    if (typeof backup[half] !== "object" || backup[half] === null) {
      throw new Error(`backup: the backup has no ${half}`);
    }
  }
  if (typeof backup.counts !== "object" || backup.counts === null) {
    throw new Error("backup: the backup states no row counts");
  }

  const whole = backup as BackupDocument;

  // **Every table this build knows about, present and an array.** Checking only
  // the tables the document happens to name accepts a document that names
  // none: `{counts:{}, replica:{}, outbox:{}}` satisfied every loop below and
  // was a complete, valid, empty backup.
  for (const [half, names] of [
    ["replica", BACKUP_TABLES.replica],
    ["outbox", BACKUP_TABLES.outbox],
  ] as const) {
    for (const name of names) {
      const rows = whole[half][name];
      if (!Array.isArray(rows)) throw new Error(`backup: ${name} is missing from the document`);
      const count = whole.counts[name];
      // The counts were written before the rows and are checked against them
      // here: a document truncated mid-write parses as valid JSON only rarely,
      // and "rarely" is not a guarantee when this is the only copy.
      if (typeof count !== "number") throw new Error(`backup: ${name} carries no count`);
      if (rows.length !== count) {
        throw new Error(`backup: ${name} says ${count} rows and carries ${rows.length}`);
      }
    }
  }
  return whole;
}
