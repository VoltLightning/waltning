/**
 * Two migrators, because the two files have opposite rules about **what
 * happens on a version mismatch** — the outbox never drops, the replica
 * migrates in place, and neither one ever refetches from a backend.
 *
 * `architecture/08` §"Surviving an app update":
 *
 * - **The replica** — migrates in place, one version per generated migration
 *   file, applied in the order those files were generated. There is no
 *   version this module ever drops the replica to recover: dropping it is
 *   not a resync, it is the deletion of the ledger, and §14.6 states the
 *   rule this whole module obeys — *"A migration must not be able to
 *   destroy the ledger. With no backend the phone's database is the only
 *   copy, and unlike the server there is nothing to reset from — no seed,
 *   no second copy, no `db:reset`."* A refetch from a backend is a
 *   *separate* operation, sync's own (arc 2) — never one a schema version
 *   triggers.
 * - **The outbox** — *"a separate, forward-only, never-destructive chain"*,
 *   and §5 of that list is one word: *"Never drop."* A missing migration is
 *   an error, never a reset, because the alternative deletes intent that
 *   exists nowhere else.
 *
 * **Both migrators copy the file first.** §14.6: *"every schema migration
 * copies the file first, runs inside a transaction, and keeps the pre-migration
 * copy until the app has opened cleanly once. A transaction alone covers an
 * error; it does not cover a crash, a kill, or a corrupt write."* The
 * filesystem is injected for the same reason the driver is — `packages/ledger`
 * runs under Node in tests and must not name `expo-file-system`.
 *
 * **And run in one transaction, bumping `user_version` inside it** (§08 item 6:
 * *"Migrations run at launch, which is when iOS is most likely to kill the
 * app."*). `PRAGMA user_version` lives in the database header and rolls back
 * with everything else, which is what makes "half-migrated" unrepresentable:
 * either the tables and the number both moved, or neither did.
 *
 * **One version per generated migration file, applied in place.** SQLite has
 * no `ALTER TABLE … ADD CONSTRAINT`, so a new `CHECK` on an existing table is
 * a copy-rename-drop `ddl.ts`'s own header describes — and drizzle-kit
 * already emits it as an ordinary step in `REPLICA_STEPS`, indexes included.
 * There is nothing here that treats a rebuild step differently from any
 * other: every step's statements run, in order, against the table as it
 * stands, rows intact — never against an assumed-empty database, because
 * this module never drops one to get back to empty.
 *
 * **Its `foreign_keys` toggle is the caller's job, not the SQL's.** SQLite
 * documents `PRAGMA foreign_keys` as a no-op once a transaction is already
 * open, so a step that rebuilds a table another populated table still
 * references (`transaction_lines`, `transaction_tags` pointing at
 * `transactions`) needs the connection's foreign keys off *before* the
 * migration transaction opens — proven by hand against `better-sqlite3`: a
 * child row survives a parent drop+recreate only when `foreign_keys` was
 * turned off before the transaction opened, deferred or not.
 * `runInOneTransaction` does exactly that for the replica, unconditionally —
 * any pending step might be a rebuild, and toggling costs nothing on a step
 * that is not one.
 *
 * **A step that cannot be expressed in SQL alone carries a hand-written
 * backfill.** `REPLICA_BACKFILLS` / `OUTBOX_BACKFILLS`, keyed by the same
 * tag `ddl.ts`'s `REPLICA_STEPS` / `OUTBOX_STEPS` carry, run inside the same
 * migration transaction as their step — the counterparties `name_folded`
 * backfill below is the one that exists today. **Not simply "after" the
 * step's own statements** — a backfill is handed the statements and runs
 * every one of them itself, because at least one of them (a `CREATE UNIQUE
 * INDEX` over the very column being backfilled) validates existing rows
 * eagerly and must not run until the backfill has already touched them.
 * `REPLICA_BACKFILLS`'s own header has the detail.
 */

import { fold } from "@waltning/core/capture/names";
import { type SQL, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { OUTBOX_STEPS, REPLICA_STEPS } from "./ddl.ts";
import type { LedgerSchema, OutboxStore, ReplicaDb, ReplicaStore } from "./open.ts";

/* ── the shapes ──────────────────────────────────────────────────────────── */

/**
 * Anything that can run a statement and read rows back: a database handle, or
 * a transaction.
 *
 * **Two capabilities, not a database.** A migration step needs to issue
 * statements and, for a backfill, read the rows it is filling in — and
 * saying only that is what lets a caller's own drizzle transaction be passed
 * straight in, including to `advanceAppliedSeq` below, whose entire contract
 * is that it runs inside a transaction it did not open. Naming a database
 * type here would force every caller to thread `TRun` and `TSchema` through
 * to answer questions no migration or backfill asks.
 */
export type SqlRunner = {
  readonly run: (query: SQL) => void;
  readonly all: <T>(query: SQL) => T[];
};

/** One step in a chain. `version` is what `PRAGMA user_version` becomes once `up` has run. */
export type Migration = {
  readonly version: number;
  readonly up: (tx: SqlRunner) => void;
};

/**
 * The filesystem operations a migration needs, injected.
 *
 * Three, and each is a step §14.6 names: **copy** the file first, **keep** the
 * copy (which is `exists` — the copy's presence *is* the record that the app
 * has not opened cleanly since), and **discard** it once it has.
 */
export type LedgerFs = {
  readonly exists: (path: string) => boolean;
  readonly copy: (from: string, to: string) => void;
  readonly remove: (path: string) => void;
};

/**
 * The pre-migration copy, and the only handle on it.
 *
 * **`release` is the caller's to call, and not from anywhere near here.** The
 * copy is kept *"until the app has opened cleanly once"*, and this module has
 * no idea when that is — a migration that commits can still produce a database
 * the first screen cannot read. Releasing it at the end of `migrate` would make
 * the copy cover the transaction, which the transaction already covers, and
 * nothing else.
 */
export type PreMigrationCopy = {
  readonly path: string;
  readonly release: () => void;
};

export type MigrationResult = {
  /** `PRAGMA user_version` as it was found. */
  readonly from: number;
  /** As it is now. */
  readonly to: number;
  /** The versions whose `up` ran, in order. Empty when there was nothing to do. */
  readonly applied: readonly number[];
  /**
   * The outstanding pre-migration copy, or `null` when there is none.
   *
   * Non-null when this run took one — and **also** when a previous run took one
   * and nobody released it, because "the app has opened cleanly since" is the
   * one thing the copy's existence records and it is still false.
   */
  readonly copy: PreMigrationCopy | null;
};

export type ReplicaMigrationResult = MigrationResult & {
  /**
   * Always `false`. Kept on the result rather than dropped outright because a
   * refetch is still a real state a replica can be in — just never one this
   * module puts it in. A schema migration never drops the replica (see this
   * file's header), so nothing this function does ever requires refetching
   * rows back from a server; that operation belongs to sync (arc 2) and is
   * triggered there, never by a version mismatch here.
   */
  readonly refetchRequired: false;
};

export type MigrateOptions = {
  readonly fs: LedgerFs;
  /** Defaults to this module's own chain; a test supplies its own. */
  readonly migrations?: readonly Migration[];
};

/** The suffix appended to a database path for its pre-migration copy. */
export const COPY_SUFFIX = ".pre-migration";

/* ── the tables ──────────────────────────────────────────────────────────── */

/**
 * The two chains, and neither one writes a line of DDL.
 *
 * **The statements are generated by drizzle-kit and committed** — `pnpm
 * ledger:generate`, `drizzle/replica/` and `drizzle/outbox/`, embedded into
 * `ddl.ts` because the phone has no filesystem this module may read from. What
 * they replaced was a runtime emitter that walked drizzle's table objects and
 * reproduced columns, affinities, `primary key` and `not null`. It could not
 * reproduce anything else, and said so — but a cost that is documented is still
 * paid: `outbox.ts` declares `index("outbox_pending_by_seq")` and the device
 * did not have it, `local_meta`'s `check ("id" = 1)` survived only by being
 * written as literal DDL right here, and every foreign key on the thirteen
 * shared tables was declared, enforced by `open.ts`'s `pragma foreign_keys`,
 * and absent from the file it was enforcing against.
 *
 * **A constraint that is declared and does not ship is worse than one that was
 * never declared**, because everything downstream reads as enforced.
 * `architecture/14` §14.6 asks the phone to mirror *"foreign keys, `CHECK`s,
 * the split-line sum, one-pivot as a partial unique index — so a bad row is
 * rejected while the person who typed it is still looking at it"*, and
 * `CLAUDE.md` puts it generally: a guarantee is a constraint, not only code.
 *
 * What derivation bought was that the shipped tables could not drift from the
 * definitions the queries are built against. That property is kept, and moved
 * from run time to commit time: the generator reads the same modules, its
 * output is committed beside the snapshot it diffed against, and
 * `test/migrate.test.ts` asserts that a migrated database holds exactly the
 * tables and columns those modules declare. The failure mode changed from
 * silent to a red test.
 */

/**
 * Every hand-written backfill a replica step needs, keyed by the step's own
 * tag (`ddl.ts`'s `REPLICA_STEPS[i].tag`) — the SQL a schema step cannot
 * itself express. Given a step's own statements, in order, and expected to
 * run every one of them — not appended after, see below for why.
 * `test/migrate.test.ts` asserts every key here names a real step tag: a
 * rename or a removed step must not leave a hook nothing ever runs.
 *
 * **A backfill runs the step's statements itself, interleaved with its own
 * SQL, rather than after all of them.** The obvious design — run the
 * step's statements verbatim, then the backfill — is wrong for
 * `"0006_schema"` specifically, and provably so: that step's own
 * `CREATE UNIQUE INDEX … (name_folded) WHERE not archived` validates every
 * existing row *at the moment it runs*, and on a table with more than one
 * active counterparty, every one of them still holds `name_folded = ''`
 * (the `ADD COLUMN`'s default) until something fills it in — so the index
 * creation itself fails before a trailing backfill ever gets to run,
 * regardless of what that backfill would have set the column to. The fix
 * has to run the fold *before* that one statement, not after all of them,
 * so this hook owns its step's execution end to end.
 *
 * **`0006_schema` fills `counterparties.name_folded`.** The column carries a
 * `DEFAULT ''` (`packages/schema/src/counterparties.sqlite.ts`) precisely so
 * the `ADD COLUMN NOT NULL` step runs on a table that already has rows —
 * `''` is what every existing row gets from the `ALTER TABLE` alone. This
 * hook finds the one statement that needs every row's `name_folded` correct
 * before it can run — matched by what it says (`CREATE UNIQUE INDEX` naming
 * `name_folded`), not by its position in the array, so a drizzle-kit
 * regenerate that reorders the step's other statements cannot silently put
 * this back in the wrong place — backfills every row with `fold(name)`
 * immediately before it, then continues.
 */
export const REPLICA_BACKFILLS: Readonly<
  Record<string, (tx: SqlRunner, statements: readonly string[]) => void>
> = {
  "0006_schema": (tx, statements) => {
    const needsFoldedNamesFirst = (statement: string) =>
      /create\s+unique\s+index/i.test(statement) && /name_folded/i.test(statement);

    for (const statement of statements) {
      if (needsFoldedNamesFirst(statement)) {
        const rows = tx.all<{ id: string; name: string }>(
          sql.raw(`select "id", "name" from "counterparties"`),
        );
        for (const row of rows) {
          tx.run(
            sql`update "counterparties" set "name_folded" = ${fold(row.name)} where "id" = ${row.id}`,
          );
        }
      }
      tx.run(sql.raw(statement));
    }
  },
};

/** No outbox step needs a backfill today — its table shape barely changes (§08 item 2), and none of the changes it has had were unexpressable in SQL alone. */
export const OUTBOX_BACKFILLS: Readonly<
  Record<string, (tx: SqlRunner, statements: readonly string[]) => void>
> = {};

/**
 * Turn one directory's generated steps into a migration chain: version
 * `i + 1` for step `i`. A step with no registered backfill runs its
 * statements verbatim, in order; a step with one hands its statements to
 * the backfill instead, which is then responsible for running every one of
 * them (see `REPLICA_BACKFILLS`'s own header for why "run them, then
 * backfill" is not always correct).
 */
function migrationsFromSteps(
  steps: readonly { readonly tag: string; readonly statements: readonly string[] }[],
  backfills: Readonly<Record<string, (tx: SqlRunner, statements: readonly string[]) => void>>,
): readonly Migration[] {
  return steps.map((step, i) => ({
    version: i + 1,
    up: (tx: SqlRunner) => {
      const backfill = backfills[step.tag];
      if (backfill) {
        backfill(tx, step.statements);
      } else {
        for (const statement of step.statements) tx.run(sql.raw(statement));
      }
    },
  }));
}

/** The replica's chain — one version per file in `drizzle/replica`, in the order `embed-ddl.ts` generated them. */
export const REPLICA_MIGRATIONS: readonly Migration[] = migrationsFromSteps(
  REPLICA_STEPS,
  REPLICA_BACKFILLS,
);

/**
 * The outbox's chain — two tables and an index, and §08 item 2 is the reason it
 * is expected to stay one version for a long time: *"the outbox table's shape
 * never changes with the domain. The payload is opaque to it, so domain changes
 * change payloads, not tables."*
 */
export const OUTBOX_MIGRATIONS: readonly Migration[] = migrationsFromSteps(
  OUTBOX_STEPS,
  OUTBOX_BACKFILLS,
);

/* ── the watermark ───────────────────────────────────────────────────────── */

/**
 * The highest outbox `seq` whose effect is present in the replica.
 *
 * Reading it takes a **branded replica handle**: the watermark describes the
 * replica's contents and nothing else, and asking the outbox for it would
 * return a plausible number from the wrong file.
 */
export function readAppliedSeq<TRun, TSchema extends LedgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): number {
  const row = db.get<{ applied_seq?: number } | undefined>(
    sql.raw(`select "applied_seq" from "local_meta" where "id" = 1`),
  );
  const value = row?.applied_seq;
  if (typeof value !== "number") {
    throw new Error("`local_meta` holds no row — the replica was not migrated by this module");
  }
  return value;
}

/**
 * Advance the watermark **inside the caller's transaction**.
 *
 * Takes a runner rather than a store, and that is the whole design: the only
 * correct place to call this is inside the transaction that writes the row the
 * new watermark describes, so the API must accept a transaction it did not open
 * and cannot accept anything else usefully. A version taking a database handle
 * would open its own transaction and commit separately, which is precisely the
 * gap the watermark exists to close.
 *
 * `where "applied_seq" < ?` makes it monotonic in SQL rather than by
 * convention: a replay that arrives out of order is a no-op instead of a
 * rewind, and a rewind would re-apply entries whose effects are already on the
 * ledger.
 *
 * **A schema migration never touches this row.** Every `REPLICA_MIGRATIONS`
 * step is DDL (plus, sometimes, a data backfill of an existing column) —
 * nothing about the local tables' *contents relative to the outbox* changes
 * when their shape does, so what has been applied to them is unchanged too.
 */
export function advanceAppliedSeq(tx: SqlRunner, seq: number): void {
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(`applied_seq must be a non-negative integer, got ${seq}`);
  }
  tx.run(
    sql`update "local_meta" set "applied_seq" = ${seq} where "id" = 1 and "applied_seq" < ${seq}`,
  );
}

/* ── the mechanism ───────────────────────────────────────────────────────── */

function readUserVersion<TRun, TSchema extends LedgerSchema>(
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>,
): number {
  const [row] = db.all<{ user_version?: number }>(sql.raw("pragma user_version"));
  const value = row?.user_version;
  if (typeof value !== "number") {
    throw new Error("`pragma user_version` returned nothing — the database is not readable");
  }
  return value;
}

/** The chain must ascend, or "the steps after `found`" is not a well-defined set. */
function checkChain(migrations: readonly Migration[]): number {
  let previous = 0;
  for (const step of migrations) {
    if (!Number.isInteger(step.version) || step.version <= previous) {
      throw new Error(
        `migration versions must be integers ascending from 1 — ${step.version} follows ${previous}`,
      );
    }
    previous = step.version;
  }
  if (previous === 0) throw new Error("a migration chain must have at least one version");
  return previous;
}

/**
 * Take the pre-migration copy, or surface the one an earlier run left behind.
 *
 * **The WAL is checkpointed first, and without that the copy is a lie.** Recent
 * commits live in the `-wal` sibling until they are folded back into the main
 * file, so copying the database alone captures the state as of the last
 * checkpoint rather than as of now — and the copy exists precisely to hold what
 * was there a moment ago.
 */
function takeCopy<TRun, TSchema extends LedgerSchema>(
  path: string,
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>,
  fs: LedgerFs,
): PreMigrationCopy {
  const [checkpoint] = db.all<{ busy?: number }>(sql.raw("pragma wal_checkpoint(truncate)"));
  if (checkpoint?.busy !== 0) {
    throw new Error("the WAL could not be checkpointed before taking the pre-migration copy");
  }
  const copyPath = `${path}${COPY_SUFFIX}`;
  fs.copy(path, copyPath);
  return { path: copyPath, release: () => fs.remove(copyPath) };
}

/**
 * Run a set of steps as one transaction that also moves `user_version`.
 *
 * `toVersion` is set from the same transaction the steps run in, so a kill at
 * any point leaves the pair consistent — the case §08 item 6 names, because
 * migrations run at launch and launch is when iOS kills things.
 *
 * **`foreignKeysOff`, toggled outside the transaction, around it.** SQLite
 * treats `PRAGMA foreign_keys` as a no-op once a transaction is open, so a
 * step that rebuilds a table (this file's own header) cannot ask for it from
 * inside `steps`; asking here, before `db.transaction` opens one, is the
 * only place the pragma actually takes. `finally` restores it whether the
 * transaction committed or rolled back — the setting is a connection
 * property, not something the rollback undoes on its own, and every other
 * statement on this connection still needs foreign keys enforced.
 */
function runInOneTransaction<TRun, TSchema extends LedgerSchema>(
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>,
  steps: readonly ((tx: SqlRunner) => void)[],
  toVersion: number,
  { foreignKeysOff = false }: { foreignKeysOff?: boolean } = {},
): void {
  if (foreignKeysOff) db.run(sql.raw("pragma foreign_keys = OFF"));
  try {
    db.transaction((tx) => {
      for (const step of steps) step(tx);
      // Interpolated because `pragma` takes no bound parameters; the value came
      // from a chain this module validated as integers.
      tx.run(sql.raw(`pragma user_version = ${toVersion}`));
    });
  } finally {
    if (foreignKeysOff) db.run(sql.raw("pragma foreign_keys = ON"));
  }
}

/**
 * The outstanding copy, if a previous run left one.
 *
 * Its existence means the app has not opened cleanly since that migration. When
 * nothing needs migrating this run, handing it back is what lets the caller
 * release it at the point it can finally say the app *did* open.
 */
function outstandingCopy(path: string, fs: LedgerFs): PreMigrationCopy | null {
  const copyPath = `${path}${COPY_SUFFIX}`;
  if (!fs.exists(copyPath)) return null;
  return { path: copyPath, release: () => fs.remove(copyPath) };
}

/**
 * Refuse to migrate over a copy nobody released.
 *
 * The copy is kept *"until the app has opened cleanly once"*, so one still
 * sitting there says the app never did — and the file it was taken from is
 * under suspicion for exactly that reason. Overwriting it with the suspect file
 * would destroy the only good copy at the moment it is most likely to be
 * needed.
 *
 * **The honest cost:** an app that crashes on launch for an unrelated reason,
 * after a migration, cannot migrate again until someone resolves the copy. That
 * is the trade — a stuck app that can be recovered from a file on disk, against
 * a smooth one that has quietly thrown that file away.
 */
function refuseStaleCopy(path: string, fs: LedgerFs): void {
  const copyPath = `${path}${COPY_SUFFIX}`;
  if (fs.exists(copyPath)) {
    throw new Error(
      `a pre-migration copy from an earlier run is still at ${copyPath} — the app has not opened cleanly since that migration. Restore from it, or release it, before migrating again`,
    );
  }
}

/**
 * `found` must be a version this chain actually passed through, or "the steps
 * after it" is not well-defined. Zero is the exception: a database SQLite
 * just created.
 */
function refuseUnknownVersion(
  found: number,
  migrations: readonly Migration[],
  store: string,
): void {
  if (found !== 0 && !migrations.some((m) => m.version === found)) {
    throw new Error(
      `${store} is at version ${found}, which is not in this build's chain [${migrations.map((m) => m.version).join(", ")}] — a missing migration is an error, never a reset`,
    );
  }
}

/* ── the two migrators ───────────────────────────────────────────────────── */

/**
 * Migrate the outbox. Forward-only, and never destructive.
 *
 * `architecture/08` §5: **"Never drop."** Everything this refuses to do is that
 * sentence: a version it does not recognise is an error, a version ahead of
 * this build is an error, and neither is a reset. The entries in this file are
 * the only copy of intentions nobody has been told about; an app that cannot
 * read them is a bug, and an app that deletes them is a data loss.
 */
export function migrateOutbox<TRun, TSchema extends LedgerSchema>(
  store: OutboxStore<TRun, TSchema>,
  options: MigrateOptions,
): MigrationResult {
  const { fs } = options;
  const migrations = options.migrations ?? OUTBOX_MIGRATIONS;
  const current = checkChain(migrations);
  const found = readUserVersion(store.db);

  if (found === current) {
    return { from: found, to: found, applied: [], copy: outstandingCopy(store.path, fs) };
  }

  if (found > current) {
    throw new Error(
      `outbox is at version ${found} and this build's chain ends at ${current} — a database written by a newer app. The outbox is never dropped (architecture/08 §5): install the newer build, or export the entries from S30 before doing anything else`,
    );
  }

  refuseUnknownVersion(found, migrations, "outbox");
  refuseStaleCopy(store.path, fs);

  const steps = migrations.filter((m) => m.version > found);
  const copy = takeCopy(store.path, store.db, fs);
  runInOneTransaction(
    store.db,
    steps.map((m) => m.up),
    current,
  );

  return { from: found, to: current, applied: steps.map((m) => m.version), copy };
}

/**
 * Migrate the replica in place. Never dropped, never refetched — see this
 * file's header for why.
 *
 * Four outcomes:
 *
 * - **At current.** Nothing happens.
 * - **At zero.** A database SQLite just created. Every step runs; there is
 *   nothing to preserve and nothing missing to reason about.
 * - **Behind current, at a version this chain recognises.** The steps after
 *   `found` run, in one transaction, against the tables as they stand — rows
 *   intact. `refetchRequired` is `false`: nothing here ever drops the
 *   replica, so nothing here ever needs the rows back from a server.
 * - **Ahead of current.** A database written by a newer app. This build
 *   raises and writes nothing — the same rule `migrateOutbox` applies, for
 *   the same reason: a build that does not recognise a version must not
 *   guess what running its own chain over it would do.
 */
export function migrateReplica<TRun, TSchema extends LedgerSchema>(
  store: ReplicaStore<TRun, TSchema>,
  options: MigrateOptions,
): ReplicaMigrationResult {
  const { fs } = options;
  const migrations = options.migrations ?? REPLICA_MIGRATIONS;
  const current = checkChain(migrations);
  const found = readUserVersion(store.db);

  if (found === current) {
    return {
      from: found,
      to: found,
      applied: [],
      copy: outstandingCopy(store.path, fs),
      refetchRequired: false,
    };
  }

  if (found > current) {
    throw new Error(
      `replica is at version ${found} and this build's chain ends at ${current} — a database written by a newer app. Install the newer build before opening this file with an older one`,
    );
  }

  refuseUnknownVersion(found, migrations, "replica");
  refuseStaleCopy(store.path, fs);

  const steps = found === 0 ? migrations : migrations.filter((m) => m.version > found);
  const copy = takeCopy(store.path, store.db, fs);
  runInOneTransaction(
    store.db,
    steps.map((m) => m.up),
    current,
    { foreignKeysOff: true },
  );

  return {
    from: found,
    to: current,
    applied: steps.map((m) => m.version),
    copy,
    refetchRequired: false,
  };
}
