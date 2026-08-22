/**
 * The phone's ledger — SQLite schema, the outbox, and the local write path.
 *
 * §14.7 puts *"the SQLite kit, plus the phone's queries, outbox and migrator"*
 * here. It never imports `packages/db`: the two engines meet only through
 * `packages/schema`, which is what keeps the divergence bounded.
 */

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
export {
  type Capture,
  type LocalTx,
  type LocalWrite,
  type LocalWriteResult,
  writeLocally,
} from "./write.ts";
