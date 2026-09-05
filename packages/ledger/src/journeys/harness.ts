/**
 * The relaunch primitive every journey stands on.
 *
 * A journey is `packages/ledger/src/test/stores.ts`'s two-file harness with
 * one addition: a `LocalLedgerSession` on top, because a journey exercises
 * the executors through the session's own write methods — S18's `create_transaction`,
 * not a raw table insert — the same distinction `stores.ts` draws between
 * `scratchStores()` and this file.
 *
 * **`relaunch()` is a crash-and-restart, expressed as close-then-reopen.**
 * `createLocalLedgerSession` migrates both files and runs `recoverOnLaunch`
 * every time it starts (`session.ts`'s `start`), which is exactly what a
 * phone does going from backgrounded to foreground after a kill — so a
 * journey never has to simulate the recovery step; it only has to close the
 * session and open a new one over the same files.
 *
 * **`raw()` is a second connection, deliberately.** A journey's own writes go
 * through the session's public methods, the way a screen would call them; but
 * `outbox` and `local_meta` are never exposed there (`architecture/14` §14.6
 * is a statement about *both* files, and neither table is a screen's
 * concern), so asserting on them needs a second handle straight onto the same
 * files, cached until the journey relaunches or closes.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readAppliedSeq } from "../migrate.ts";
import { type Ledger, type LedgerPaths, openLedger, type SqliteOpener } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import {
  type BootstrapCurrency,
  createLocalLedgerSession,
  type LocalLedgerSession,
  type LocalLedgerSessionOptions,
} from "../session.ts";
import { nodeFs } from "../test/stores.ts";
import type { Capture } from "../write.ts";

type Schema = typeof ledgerSchema;
type Run = Database.RunResult;

const openWithBetterSqlite: SqliteOpener<Run, Schema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema: ledgerSchema }), close: () => sqlite.close() };
};

/** Every journey captures from the same place — Warsaw, in summer offset, matching the fixtures in `SPEC.md`'s own examples. */
const JOURNEY_CAPTURE: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 120 };

/** A row selected straight off `outbox`, in send order — not `LocalLedgerSession`'s shape, which never exposes this table. */
export type OutboxRow = typeof ledgerSchema.outbox.$inferSelect;

/** A row selected straight off `transactions` — the stored shape, not `LocalTransactionRow`'s read-side join. */
export type TransactionRow = typeof ledgerSchema.transactions.$inferSelect;

export type Journey = {
  /** The live session. Replaced, not mutated, by `relaunch()`. */
  session: LocalLedgerSession;
  paths: LedgerPaths;
  capture: Capture;
  /** A second, read-only handle over both files — for `outbox` and `local_meta`, which the session never exposes. */
  raw: () => Ledger<Run, Schema>;
  /** Close everything, then reopen — migrating and recovering exactly as a real launch would. */
  relaunch: () => LocalLedgerSession;
  /** Close everything and remove the temp directory. */
  close: () => void;
};

export function openJourney(options?: {
  bootstrap?: readonly BootstrapCurrency[];
  /**
   * A chain below this build's head, for the one caller that needs a session
   * over an *older* database: `tools/dump-fixture.ts`, dumping the fixture for
   * the version a branch leaves behind. See `LocalLedgerSessionOptions`.
   */
  migrations?: LocalLedgerSessionOptions<Run>["migrations"];
}): Journey {
  const dir = mkdtempSync(join(tmpdir(), "waltning-journey-"));
  const paths: LedgerPaths = { replica: join(dir, "replica.db"), outbox: join(dir, "outbox.db") };

  const sessionOptions: LocalLedgerSessionOptions<Run> = {
    open: openWithBetterSqlite,
    paths,
    fs: nodeFs,
    removeDatabase: (path) => rmSync(path, { force: true }),
    bootstrapCurrencies: options?.bootstrap ?? [],
    ...(options?.migrations ? { migrations: options.migrations } : {}),
    // No journey built on this harness is about a pre-journal store — that
    // gets its own construction in `upgrade.journey.test.ts`.
    preJournalStores: "refuse",
  };

  let rawLedger: Ledger<Run, Schema> | undefined;

  const closeRaw = () => {
    rawLedger?.close();
    rawLedger = undefined;
  };

  const journey: Journey = {
    session: createLocalLedgerSession(sessionOptions),
    paths,
    capture: JOURNEY_CAPTURE,
    raw: () => {
      rawLedger ??= openLedger(openWithBetterSqlite, paths);
      return rawLedger;
    },
    relaunch: () => {
      closeRaw();
      journey.session.close();
      journey.session = createLocalLedgerSession(sessionOptions);
      return journey.session;
    },
    close: () => {
      closeRaw();
      journey.session.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };

  return journey;
}

/** The replica's watermark — the highest outbox `seq` whose effect is on the ledger. */
export function appliedSeq(j: Journey): number {
  return readAppliedSeq(j.raw().replica.db);
}

/** Every outbox entry, in send order. */
export function outboxEntries(j: Journey): readonly OutboxRow[] {
  return j
    .raw()
    .outbox.db.select()
    .from(ledgerSchema.outbox)
    .orderBy(asc(ledgerSchema.outbox.seq))
    .all();
}

/** Every transaction row on the replica. */
export function transactionRows(j: Journey): readonly TransactionRow[] {
  return j.raw().replica.db.select().from(ledgerSchema.transactions).all();
}
