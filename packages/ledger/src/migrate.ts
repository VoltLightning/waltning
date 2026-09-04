/**
 * Two migrators, because the two files have opposite rules.
 *
 * `architecture/08` §"Surviving an app update" gives each store its own version
 * counter and its own answer to a mismatch:
 *
 * - **The replica** — *"`PRAGMA user_version` for the replica — mismatch means
 *   drop and refetch"*. Safe *"for exactly the reason the outbox below is not:
 *   the replica is a copy"*.
 * - **The outbox** — *"a separate, forward-only, never-destructive chain"*, and
 *   §5 of that list is one word: *"Never drop."* A missing migration is an
 *   error, never a reset, because the alternative deletes intent that exists
 *   nowhere else.
 *
 * **And one carve-out, which is the sharpest edge in this file.** §14.1: when
 * there is no server, *"with no server the outbox never drains"* —
 * and the replica is not a copy of anything. Dropping it is not a refetch, it
 * is the deletion of the ledger. §14.6 states the rule the whole module obeys:
 * *"A migration must not be able to destroy the ledger. With no backend the
 * phone's database is the only copy, and unlike the server there is nothing to
 * reset from — no seed, no second copy, no `db:reset`."*
 *
 * So the drop is conditional on there being somewhere to refetch **from**, and
 * that condition is a parameter rather than a guess: whether a backend has ever
 * been reached is knowledge this module does not have and must not invent. When
 * it would drop and must not, it fails loudly and touches nothing.
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
 * **A constraint added to a table that already ships means a versioned,
 * in-place rebuild from now on (M2) — never folding it into `REPLICA_DDL`'s
 * single version.** SQLite has no `ALTER TABLE … ADD CONSTRAINT`, so a new
 * `CHECK` on an existing table is a copy-rename-drop (`REPLICA_DDL_REBUILD_*`,
 * `ddl.ts`'s own header) — and folding that into version 1's `up`, as the
 * single-version chain used to, is exactly wrong for a phone already at
 * version 1: this module's only lever for *any* version mismatch there was
 * *drop the whole replica and refetch*, and an offline-only phone
 * (`canRefetch: false`) has no refetch half of that, so the new constraint
 * would simply never reach it — silently, because nothing ever bumped
 * `REPLICA_MIGRATIONS` to make the mismatch exist in the first place. A
 * migration marked `inPlace` is the escape hatch: `migrateReplica` runs it
 * against the table as it stands, rows intact, rather than treating it as a
 * reason to drop. It is what a table rebuild actually is — an ALTER SQLite
 * cannot express any other way — never a licence to skip the drop-and-refetch
 * rule for an actual schema redesign.
 *
 * **Its `foreign_keys` toggle is the caller's job, not the SQL's.** SQLite
 * documents `PRAGMA foreign_keys` as a no-op once a transaction is already
 * open — the same trap `dropEverything` below works around with
 * `defer_foreign_keys` — and unlike that function, an in-place rebuild
 * cannot use `defer_foreign_keys` at all: it does not drop every table, so a
 * sibling still holding real rows (`transaction_lines`, `transaction_tags`)
 * would have its `ON DELETE CASCADE` fire for real when the rebuilt table is
 * dropped, deferred check or not — proven by hand against `better-sqlite3`:
 * a child row survives a parent drop+recreate only when `foreign_keys` was
 * turned off *before* the transaction opened. `runInOneTransaction` does
 * exactly that, toggled around the whole run whenever any step it is given
 * is `inPlace`.
 */

import { type SQL, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { OUTBOX_DDL, REPLICA_DDL, REPLICA_DDL_REBUILD_0007_SCHEMA } from "./ddl.ts";
import type { LedgerSchema, OutboxStore, ReplicaDb, ReplicaStore } from "./open.ts";

/* ── the shapes ──────────────────────────────────────────────────────────── */

/**
 * Anything that can run one statement: a database handle, or a transaction.
 *
 * **One capability, not a database.** A migration needs to issue statements and
 * nothing else, and saying only that is what lets a caller's own drizzle
 * transaction be passed straight in — including to `advanceAppliedSeq` below,
 * whose entire contract is that it runs inside a transaction it did not open.
 * Naming a database type here would force every caller to thread `TRun` and
 * `TSchema` through to answer questions no migration asks.
 */
export type SqlRunner = { readonly run: (query: SQL) => void };

/** One step in a chain. `version` is what `PRAGMA user_version` becomes once `up` has run. */
export type Migration = {
  readonly version: number;
  readonly up: (tx: SqlRunner) => void;
  /**
   * True when `up` rebuilds an existing table in place (copy-rename-drop,
   * SQLite's only way to add a constraint) rather than assuming a blank
   * database (M2). Only `migrateReplica` reads this — the outbox is
   * forward-only DDL and never dropped in the first place, so the question
   * does not arise there. Defaults to `false`/absent: an unmarked version
   * bump stays destructive, on purpose — this module fails closed rather
   * than guessing a step preserves data it never said it does.
   */
  readonly inPlace?: boolean;
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
   * The replica was dropped and holds nothing. Every row has to come back from
   * the server before a figure computed off it means anything.
   */
  readonly refetchRequired: boolean;
};

export type MigrateOptions = {
  readonly fs: LedgerFs;
  /** Defaults to this module's own chain; a test supplies its own. */
  readonly migrations?: readonly Migration[];
};

export type MigrateReplicaOptions = MigrateOptions & {
  /**
   * Has a backend ever been reached?
   *
   * **Injected, because it is not knowable here and guessing it is
   * catastrophic.** `false` means the replica is the only copy of the ledger
   * and the drop-and-refetch rule has no *refetch* half. `true` means the server
   * holds the canonical base and the outbox holds every unadmitted local intent,
   * so drop, refetch and replay cost a resync and nothing else.
   *
   * It asks *ever*, not *now*. A phone that is merely offline this second still
   * has somewhere to refetch from.
   */
  readonly canRefetch: boolean;
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
 * The replica's chain.
 *
 * **Two versions, not one.** Version 1 is every table exactly as a fresh
 * install needs it. Version 2 exists only because `transactions` gained a
 * `CHECK` after phones were already at version 1 (M2, this file's own
 * header) — `inPlace: true` is what tells `migrateReplica` this step rebuilds
 * `transactions` where it stands rather than assuming an empty database, so
 * it reaches an already-installed phone — offline-only ones included —
 * without the drop-and-refetch rule engaging at all.
 */
export const REPLICA_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (tx) => {
      for (const statement of REPLICA_DDL) tx.run(sql.raw(statement));
    },
  },
  {
    version: 2,
    up: (tx) => {
      for (const statement of REPLICA_DDL_REBUILD_0007_SCHEMA) tx.run(sql.raw(statement));
    },
    inPlace: true,
  },
];

/**
 * The outbox's chain — two tables and an index, and §08 item 2 is the reason it
 * is expected to stay one version for a long time: *"the outbox table's shape
 * never changes with the domain. The payload is opaque to it, so domain changes
 * change payloads, not tables."*
 */
export const OUTBOX_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (tx) => {
      for (const statement of OUTBOX_DDL) tx.run(sql.raw(statement));
    },
  },
];

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

/** The chain must ascend, or "the versions after `found`" is not a well-defined set. */
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
 * migration that needs it off for an in-place table rebuild (M2 — see this
 * file's header) cannot ask for it from inside `steps`; asking here, before
 * `db.transaction` opens one, is the only place the pragma actually takes.
 * `finally` restores it whether the transaction committed or rolled back —
 * the setting is a connection property, not something the rollback undoes on
 * its own, and every other statement on this connection still needs foreign
 * keys enforced.
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
 * A step that drops every table and view in the database.
 *
 * The names are read **before** the transaction opens — one connection, one
 * writer, nothing else is touching this file — and only the object list is
 * carried in. `local_meta` goes with them, which is correct: see
 * `migrateReplica`.
 */
function dropEverything<TRun, TSchema extends LedgerSchema>(
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>,
): (tx: SqlRunner) => void {
  const objects = db.all<{ name: string; type: string }>(
    sql.raw(
      "select name, type from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%'",
    ),
  );
  return (tx) => {
    /**
     * **Defer the foreign keys, for the length of this transaction only.**
     *
     * `open.ts` has `pragma foreign_keys` on for the replica, and the tables it
     * is enforcing against now actually declare references — so `drop table
     * "accounts"` does an implicit `delete from accounts` and is refused on the
     * spot by every `transactions` row pointing at it. There is no drop order
     * that fixes it either: `transactions` and `categories` reference each other
     * through `parent_id`-shaped chains, and a topological sort maintained here
     * would be a second copy of the schema's edges.
     *
     * `pragma foreign_keys = off` is the obvious reach and is a **silent no-op
     * inside a transaction** — SQLite documents it as such, so it would leave
     * the drop failing exactly as before with nothing to point at.
     * `defer_foreign_keys` is the sanctioned one: constraints are checked at
     * COMMIT instead of per-statement, and it clears itself when the
     * transaction ends. By COMMIT the tables have been recreated empty, so
     * there is nothing left to violate — and a chain that dropped without
     * recreating would fail at COMMIT rather than pass, which is the direction
     * this file wants to fail in.
     */
    tx.run(sql.raw("pragma defer_foreign_keys = on"));
    for (const object of objects) {
      // Names come from this module's own DDL, but a quote in one would end the
      // identifier and start a statement. Cheaper to refuse than to reason about.
      if (object.name.includes('"')) throw new Error(`unquotable object name: ${object.name}`);
      const kind = object.type === "view" ? "view" : "table";
      tx.run(sql.raw(`drop ${kind} if exists "${object.name}"`));
    }
  };
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

  // `found` must be a version this chain actually passed through, or "the steps
  // after it" is a guess. Zero is the exception: a database SQLite just created.
  if (found !== 0 && !migrations.some((m) => m.version === found)) {
    throw new Error(
      `outbox is at version ${found}, which is not in this build's chain [${migrations.map((m) => m.version).join(", ")}] — a missing migration is an error, never a reset (architecture/08 §5)`,
    );
  }

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
 * Migrate the replica — or drop and recreate it, when there is somewhere to
 * refetch from.
 *
 * Four outcomes, and the last two are why this function is not the one above:
 *
 * - **At current.** Nothing happens.
 * - **At zero.** A database SQLite just created. The chain runs; there is
 *   nothing to lose and nothing to refetch.
 * - **At anything else, every pending step `inPlace`.** A table rebuild (M2,
 *   this file's own header) that keeps the rows it started with — run
 *   without dropping anything, `canRefetch` never asked. This is the
 *   escape hatch, not the default: a step earns it by rebuilding one table
 *   where it stands, never by being convenient.
 * - **At anything else, otherwise.** §08's rule for the replica is *drop and
 *   refetch*, not *migrate*, and that is deliberate: it is what saves the
 *   replica from needing a second migration chain to maintain for a change
 *   that is not an in-place rebuild. Applied here **only if `canRefetch`** —
 *   otherwise the "refetch" half does not exist, this file is the ledger, and
 *   dropping it destroys the record (§14.6). Then it raises, and has written
 *   nothing.
 *
 * **What happens to the watermark**, in each case. A forward *schema*
 * migration — in place or not — keeps `local_meta` untouched: the local
 * tables still hold what they held, so what has been applied to them is
 * unchanged. A **drop** takes it with everything else and the chain
 * recreates it at zero — which is right, and the safe direction besides: a
 * refetched replica holds what the *server* has admitted, so every entry
 * still in the outbox is by definition not reflected in it and must be
 * replayed. Erring the other way would strand intent that exists nowhere
 * else. With no backend this never arises for a non-in-place step: the
 * replica is never dropped, so the watermark only ever resets once a backend
 * exists.
 */
export function migrateReplica<TRun, TSchema extends LedgerSchema>(
  store: ReplicaStore<TRun, TSchema>,
  options: MigrateReplicaOptions,
): ReplicaMigrationResult {
  const { fs, canRefetch } = options;
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

  // The steps that have not run yet. When every one of them rebuilds in
  // place (M2), that is reason enough on its own not to drop — a phone with
  // no backend gets the rebuild through the same door a phone with one does,
  // rather than being permanently stuck at `found` because it has no
  // refetch half to satisfy the ordinary rule below. `found < current` is
  // checked alongside `pending.every` on purpose and not folded away: `every`
  // over an empty array is vacuously `true`, and `pending` is empty whenever
  // `found` is *ahead* of this build's own chain (a newer or corrupted
  // database) — that case still means dropping, never "nothing pending, so
  // silently stamp `user_version` down to `current`".
  const pending = migrations.filter((m) => m.version > found);
  const inPlaceEligible = found < current && pending.every((m) => m.inPlace === true);
  const dropping = found !== 0 && !inPlaceEligible;

  if (dropping && !canRefetch) {
    // Before the copy, before the checkpoint, before anything: the whole
    // contract of this branch is that the file is left exactly as it was.
    throw new Error(
      `replica is at version ${found} and this build is at ${current}, so the rule is drop and refetch — but no backend has ever been reached, so there is nothing to refetch from and this file is the only copy of the ledger (architecture/14 §14.6). Install a build at version ${found}, or export the ledger before running one that would drop it`,
    );
  }

  refuseStaleCopy(store.path, fs);

  const copy = takeCopy(store.path, store.db, fs);
  // At zero every migration runs (there is nothing to skip past); dropping
  // rebuilds from nothing the same way; otherwise only the steps after
  // `found` run, in place, against the rows already there.
  const running = found === 0 || dropping ? migrations : pending;
  const steps = dropping
    ? [dropEverything(store.db), ...running.map((m) => m.up)]
    : running.map((m) => m.up);
  runInOneTransaction(store.db, steps, current, {
    foreignKeysOff: running.some((m) => m.inPlace),
  });

  return {
    from: found,
    to: current,
    applied: running.map((m) => m.version),
    copy,
    refetchRequired: dropping,
  };
}
