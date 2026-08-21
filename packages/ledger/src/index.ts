/**
 * The phone's ledger — SQLite schema, the outbox, and the local write path.
 *
 * §14.7 puts *"the SQLite kit, plus the phone's queries, outbox and migrator"*
 * here. It never imports `packages/db`: the two engines meet only through
 * `packages/schema`, which is what keeps the divergence bounded.
 */

export * from "./schema.ts";
export { type LocalWrite, type LocalWriteResult, writeLocally } from "./write.ts";
