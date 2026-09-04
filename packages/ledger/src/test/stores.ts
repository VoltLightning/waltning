/**
 * Two real database files, opened the way the device opens them.
 *
 * `scratch.ts` builds one merged in-memory database, which is right for testing
 * a table or a migration chain and wrong for everything in this directory that
 * cares about the *separation*. `writeLocally` and `recoverOnLaunch` exist
 * precisely because the two stores cannot commit together — a harness that put
 * them in one database would make every crash test pass by construction, and
 * would be testing the bug rather than the fix.
 *
 * So this goes through `openLedger` with a `better-sqlite3` factory: the same
 * function the app calls, the same pragmas, the same brands. Only the driver
 * differs, which is what the injected opener is for.
 *
 * **Files on disk, not `:memory:`.** The property under test is what survives
 * the process going away, and an in-memory database is closed when it does.
 * `reopen()` below is the whole point of the file.
 *
 * **Exported (`./test/stores`), for one caller outside this package.** D5's
 * `apps/mobile/src/journeys/j02-daily-capture.test.tsx` mounts the real
 * screens over a real `LocalLedgerSession` — `wave-4-shared.md`'s "an
 * executor is the phone's whole contract" holds for a journey test too, so it
 * cannot run a fake port. Reusing this rather than a second copy is what
 * `CLAUDE.md`'s "no abstraction before the third use" already implies once a
 * second, legitimate caller exists.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrateOutbox, migrateReplica } from "../migrate.ts";
import { type Ledger, type LedgerPaths, openLedger, type SqliteOpener } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

type Schema = typeof schema;
type Run = Database.RunResult;

/** The real filesystem, as the migrator's copy step needs it. */
export const nodeFs = {
  exists: (path: string) => existsSync(path),
  copy: (from: string, to: string) => copyFileSync(from, to),
  remove: (path: string) => rmSync(path, { force: true }),
};

const openWithBetterSqlite: SqliteOpener<Run, Schema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
};

export type ScratchStores = {
  ledger: Ledger<Run, Schema>;
  paths: LedgerPaths;
  /**
   * Close and open again, running the migrators as launch does.
   *
   * This is how a crash is expressed in a test: do half a write, `reopen()`,
   * and assert on what the second launch found. Nothing simulates a kill — the
   * work simply is not done, which is exactly the state a kill leaves.
   */
  reopen: () => Ledger<Run, Schema>;
  close: () => void;
};

/** Open both stores in a fresh temporary directory, migrated and ready. */
export function scratchStores(): ScratchStores {
  const dir = mkdtempSync(join(tmpdir(), "waltning-ledger-"));
  const paths: LedgerPaths = { replica: join(dir, "replica.db"), outbox: join(dir, "outbox.db") };

  let ledger = migrated();

  function migrated(): Ledger<Run, Schema> {
    const opened = openLedger(openWithBetterSqlite, paths);
    // Outbox first, mirroring the order a launch has to use: the replica's
    // watermark is meaningless until the queue it counts against exists.
    migrateOutbox(opened.outbox, { fs: nodeFs });
    migrateReplica(opened.replica, { fs: nodeFs });
    return opened;
  }

  return {
    get ledger() {
      return ledger;
    },
    paths,
    reopen: () => {
      ledger.close();
      ledger = migrated();
      return ledger;
    },
    close: () => {
      ledger.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
