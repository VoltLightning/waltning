/**
 * Opening the phone's two databases.
 *
 * **Two files, and the split is load-bearing.** `SPEC.md` §5.7: *"`replica.db`
 * and `outbox.db` are separate files, so a replica refetch — epoch mismatch, an
 * explicit reset — never touches the outbox, which must survive independently
 * of the replica's state."* The replica is a copy of rows a server can resend;
 * the outbox holds intent that exists nowhere else. One is discardable and the
 * other is irreplaceable, and one file makes the discard destroy both.
 *
 * **One connection over both, via `ATTACH`, was considered and rejected.** It
 * is the obvious way to get a transaction spanning the two, and it does not
 * give one. SQLite states it plainly, in the list of what WAL costs:
 * *"Transactions that involve changes against multiple ATTACHed databases are
 * atomic for each individual database, but are not atomic across all databases
 * as a set."* WAL is not optional here (below), so the atomicity `ATTACH` looks
 * like it buys is not on offer — and it still costs the property the two files
 * exist for: a drop-and-refetch would have to detach, delete and re-attach a
 * file whose connection is also the outbox's. Two connections, two files, and
 * the boundary stays where §5.7 drew it.
 *
 * **The driver is injected, not imported.** `packages/ledger` must not depend on
 * `expo-sqlite`: that package needs the Expo native runtime, so importing it
 * here would make every test in this package unrunnable under Node — and the
 * things worth testing are exactly the ones that need a real transaction. The
 * device passes an `expo-sqlite` opener, the tests pass a `better-sqlite3` one,
 * and this module names neither.
 */

import { sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * The constraint drizzle puts on a schema map, named once.
 *
 * A schema map is heterogeneous by definition — thirteen tables of thirteen
 * shapes — so `unknown` in this *constraint* position is the legitimate use
 * `CLAUDE.md` names, not a placeholder pushed to a call site.
 *
 * Naming it is not the `LocalDb` alias `write.ts` refuses. That one would have
 * had to answer for the driver's run-result too, a question no caller asks;
 * this answers only for the schema map, and **every declaration below still
 * carries both type parameters** rather than erasing them behind a name.
 */
export type LedgerSchema = Record<string, unknown>;

declare const STORE: unique symbol;

/**
 * The replica's handle — a drizzle database that has been *told which file it
 * is*.
 *
 * Both databases are opened by the same driver over the same schema map, so
 * structurally the two handles are the same type. Naming the fields `replica`
 * and `outbox` documents the difference and enforces nothing:
 * `writeLocally(ledger.replica.db, …)` where the outbox was meant compiles
 * cleanly and writes the wrong file — silently, and the wrong way round from
 * every failure mode `write.ts` guards, because the intent lands somewhere that
 * will never be drained and the ledger row never lands at all.
 *
 * So the two are branded, the way `Id<Table>` brands twenty-two id columns for
 * exactly the same reason: the mix-up is the compiler's problem now, and the
 * phantom property compiles away entirely under `erasableSyntaxOnly`.
 */
export type ReplicaDb<TRun, TSchema extends LedgerSchema> = BaseSQLiteDatabase<
  "sync",
  TRun,
  TSchema
> & { readonly [STORE]: "replica" };

/** The outbox's handle. The other half of the brand above. */
export type OutboxDb<TRun, TSchema extends LedgerSchema> = BaseSQLiteDatabase<
  "sync",
  TRun,
  TSchema
> & { readonly [STORE]: "outbox" };

/**
 * One open database file.
 *
 * `path` is here because the migrator needs it: the pre-migration copy is a
 * *file* copy, so the one thing a database handle cannot tell you is the one
 * thing that step needs.
 */
export type LedgerStore<TDb> = {
  readonly path: string;
  readonly db: TDb;
  readonly close: () => void;
};

export type ReplicaStore<TRun, TSchema extends LedgerSchema> = LedgerStore<
  ReplicaDb<TRun, TSchema>
>;
export type OutboxStore<TRun, TSchema extends LedgerSchema> = LedgerStore<OutboxDb<TRun, TSchema>>;

/**
 * What a platform driver hands back for one file.
 *
 * Deliberately two members. Everything this module and the migrator do to a
 * database — pragmas included — goes through drizzle's `run`/`get`/`all` over
 * `sql.raw`, which both drivers implement, so there is no third escape hatch to
 * keep honest and no place for the two drivers to differ quietly.
 */
export type OpenedSqlite<TRun, TSchema extends LedgerSchema> = {
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>;
  close: () => void;
};

/** Open one SQLite file. `expo-sqlite` on the device, `better-sqlite3` in tests. */
export type SqliteOpener<TRun, TSchema extends LedgerSchema> = (
  filename: string,
) => OpenedSqlite<TRun, TSchema>;

export type LedgerPaths = {
  readonly replica: string;
  readonly outbox: string;
};

export type OpenOptions = {
  /**
   * How long a statement waits for a writer to finish before giving up.
   *
   * Zero is SQLite's default and is wrong for an app: it turns every overlap
   * into `SQLITE_BUSY` at the call site, and the app's own background work is
   * what it overlaps with.
   */
  readonly busyTimeoutMs?: number;
};

export type Ledger<TRun, TSchema extends LedgerSchema> = {
  readonly replica: ReplicaStore<TRun, TSchema>;
  readonly outbox: OutboxStore<TRun, TSchema>;
  /** Close both. Attempted on both even if the first throws. */
  readonly close: () => void;
};

/** Five seconds: long enough to outlast any write this app makes, short enough to be a bug report. */
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

/** SQLite's name for a private, per-connection database. Two of them are two databases. */
const IN_MEMORY = ":memory:";

/**
 * Apply the pragmas a file is opened with.
 *
 * **Pragmas are per-connection**, not stored in the file — `foreign_keys` and
 * `busy_timeout` are re-applied by whoever opens the database next, or they are
 * not in force. Setting them anywhere but here means a second connection
 * somewhere runs against a laxer database than this one.
 */
function tune<TRun, TSchema extends LedgerSchema>(
  db: BaseSQLiteDatabase<"sync", TRun, TSchema>,
  options: { busyTimeoutMs: number; foreignKeys: boolean; synchronous: "NORMAL" | "FULL" },
): void {
  /**
   * **WAL.** A reader does not block the writer and the writer does not block
   * readers, which is the shape of this app: a screen is reading the ledger
   * while a capture commits. It is also persistent — set once, stored in the
   * file — unlike everything else here.
   *
   * It is what makes `ATTACH` useless above, and it is what makes the
   * migrator's checkpoint necessary: recent writes live in the `-wal` sibling
   * until they are folded back, so a file copy taken without one is stale.
   * §5.7 names the `-wal` and `-shm` siblings for the same reason — they hold
   * real data and need the same file protection class as the database.
   */
  db.run(sql.raw("pragma journal_mode = WAL"));

  /**
   * Interpolated, so it is pinned to an integer first. Every other statement in
   * this file is a literal; this is the one that takes a caller's value, and
   * `pragma` takes no bound parameters.
   */
  const timeout = Math.trunc(options.busyTimeoutMs);
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new Error(`busyTimeoutMs must be a non-negative integer, got ${options.busyTimeoutMs}`);
  }
  db.run(sql.raw(`pragma busy_timeout = ${timeout}`));

  /**
   * `NORMAL` under WAL loses nothing to an app crash or a force-quit — only to
   * an OS crash or power loss, and then only the last transactions. `FULL`
   * fsyncs every commit and is the right trade for a file whose contents exist
   * nowhere else; the replica's contents exist on a server.
   */
  db.run(sql.raw(`pragma synchronous = ${options.synchronous}`));

  /**
   * **Foreign keys, stated in both directions rather than left to a default.**
   *
   * SQLite's own default is off, per connection, forever — a compatibility
   * promise it will not break. Drivers then disagree: `better-sqlite3` turns
   * them on when it opens a file, and a `foreignKeys: false` that only skipped
   * a statement would inherit whichever answer the driver happened to have.
   * Saying it outright is what makes the two drivers the same database.
   *
   * On the replica it is on, because §14.6 requires the phone to refuse what
   * the server would refuse *at capture time* and a declared-but-unenforced
   * reference refuses nothing. `packages/ledger/src/test/scratch.ts`
   * deliberately leaves them off — a harness that enforced them would be
   * testing a stricter database than the one that ships — so **this is where
   * they get turned on**, on the device, on the connection holding the
   * referencing rows.
   *
   * On the outbox it is off, and it costs nothing: the outbox references
   * nothing, because its payload is opaque JSON by design.
   */
  db.run(sql.raw(`pragma foreign_keys = ${options.foreignKeys ? "ON" : "OFF"}`));
}

/**
 * Open the replica and the outbox, tuned and branded.
 *
 * Migration is a separate step and a separate module: the two files have
 * opposite rules about what a version mismatch means, and folding that decision
 * into "open" would make the destructive one implicit.
 */
export function openLedger<TRun, TSchema extends LedgerSchema>(
  open: SqliteOpener<TRun, TSchema>,
  paths: LedgerPaths,
  options: OpenOptions = {},
): Ledger<TRun, TSchema> {
  // A configuration that names one file twice reintroduces exactly what §5.7
  // separated, and does it invisibly — every write still works, right up to the
  // refetch that takes the outbox with it. Two `:memory:` databases are two
  // databases, so that one string is not the same mistake.
  if (paths.replica === paths.outbox && paths.replica !== IN_MEMORY) {
    throw new Error(
      `replica and outbox must be separate files (§5.7) — both are "${paths.replica}"`,
    );
  }

  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;

  const replicaFile = open(paths.replica);
  let outboxFile: OpenedSqlite<TRun, TSchema>;
  try {
    outboxFile = open(paths.outbox);
  } catch (error) {
    // Half-open is worse than closed: the replica's connection would be held by
    // a process that is about to report it failed to start.
    replicaFile.close();
    throw error;
  }

  try {
    tune(replicaFile.db, { busyTimeoutMs, foreignKeys: true, synchronous: "NORMAL" });
    tune(outboxFile.db, { busyTimeoutMs, foreignKeys: false, synchronous: "FULL" });
  } catch (error) {
    replicaFile.close();
    outboxFile.close();
    throw error;
  }

  /**
   * **The two casts, and there are only two.**
   *
   * This is a cast with a name, and that is the honest description — the same
   * one `id.ts` gives its own. There is nothing to validate at run time: a
   * database handle carries no evidence of which file it opened, and the only
   * evidence there ever was is the argument passed to `open` one line above.
   * What the brand buys is that the claim is made *once*, here, in the function
   * whose entire job is knowing which file it just opened, and is a compile
   * error everywhere else.
   */
  const replica: ReplicaStore<TRun, TSchema> = {
    path: paths.replica,
    db: replicaFile.db as ReplicaDb<TRun, TSchema>,
    close: () => replicaFile.close(),
  };

  const outbox: OutboxStore<TRun, TSchema> = {
    path: paths.outbox,
    db: outboxFile.db as OutboxDb<TRun, TSchema>,
    close: () => outboxFile.close(),
  };

  return {
    replica,
    outbox,
    close: () => {
      try {
        replica.close();
      } finally {
        // The irreplaceable file closes even when closing the discardable one
        // threw. `finally` rather than a second `try` because a failure to
        // close the replica is still worth reporting.
        outbox.close();
      }
    },
  };
}
