/**
 * The phone's ledger — SQLite schema, the outbox, and the local write path.
 *
 * §14.7 puts *"the SQLite kit, plus the phone's queries, outbox and migrator"*
 * here. It never imports `packages/db`: the two engines meet only through
 * `packages/schema`, which is what keeps the divergence bounded.
 */

import { createAccountExecutor } from "./accounts/index.ts";
import { localRegistry } from "./executor.ts";
import { createTransactionExecutor } from "./transactions/index.ts";

export {
  createAccountExecutor,
  type LocalAccountRow,
  type LocalAccountSummary,
  readAccounts,
} from "./accounts/index.ts";
export {
  type AnyLocalExecutor,
  defineLocalExecutor,
  type LocalExecutor,
  type LocalRegistry,
  localRegistry,
} from "./executor.ts";
export {
  advanceAppliedSeq,
  type LedgerFs,
  type Migration,
  type MigrationResult,
  migrateOutbox,
  migrateReplica,
  type ReplicaMigrationResult,
  readAppliedSeq,
} from "./migrate.ts";
export {
  type Ledger,
  type LedgerPaths,
  type LedgerSchema,
  type OutboxDb,
  openLedger,
  type ReplicaDb,
  type SqliteOpener,
} from "./open.ts";
export { type LaunchRecovery, type ReplayHalt, recoverOnLaunch } from "./recover.ts";
export * from "./schema.ts";
export { ledgerSchema } from "./schema-map.ts";
export {
  type BootstrapCurrency,
  createLocalLedgerSession,
  type LocalLedgerSession,
  type LocalLedgerSessionOptions,
  USD_BOOTSTRAP,
} from "./session.ts";
export {
  createTransactionExecutor,
  type LocalRecentTransaction,
  type LocalTransactionRow,
  readRecent,
} from "./transactions/index.ts";
export {
  type Capture,
  type LocalTx,
  type LocalWrite,
  type LocalWriteResult,
  writeLocally,
} from "./write.ts";

/**
 * Every operation the phone can apply locally, keyed by the server's name for
 * it.
 *
 * **Assembled here, in the barrel, because the domain modules must not import
 * each other** — the architecture rule is *"only `index.ts` is public and no
 * module or feature imports another — compose at the registry"*. A later API
 * composes in its registry; this package's public surface is one file, so this
 * is that place.
 *
 * `writeLocally` needs the whole set even to enqueue a single write, because
 * `deriveDeps` asks every *already-queued* entry what ids it is about to mint,
 * and only that entry's own operation can answer. An operation missing from
 * this list contributes no minted ids, which biases toward a dependent entry
 * sending ahead of the row it names — a 404 and a block, for something nobody
 * did wrong. `recover.ts` reads the same map to replay an entry after a crash,
 * where a missing name halts replay outright. **Adding an executor without
 * adding it here fails in both directions and neither one is loud.**
 *
 * Typed over `LocalTx<unknown, …>` by way of the executors' own declarations:
 * the driver's run-result is the app's business (`expo-sqlite` on the device,
 * `better-sqlite3` in tests) and nothing in an executor reads one.
 */
export const ledgerRegistry = localRegistry([createAccountExecutor, createTransactionExecutor]);
