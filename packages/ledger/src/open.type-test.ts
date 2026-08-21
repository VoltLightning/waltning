/**
 * The two stores are branded, asserted at compile time.
 *
 * Both databases are opened by the same driver over the same schema map, so
 * structurally the two handles are identical and `writeLocally(replica, …)`
 * where the outbox was meant compiles cleanly. The failure is total and silent
 * in both halves at once: the intent lands in a file nothing drains, and the
 * ledger row never lands at all — the two failure modes `write.ts` exists to
 * prevent, produced by a swap the compiler had no way to see.
 *
 * `open.ts` is the only place that asserts either brand, so these assertions
 * are what make that one cast worth anything downstream.
 */

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { OutboxDb, OutboxStore, ReplicaDb, ReplicaStore } from "./open.ts";

type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type Extends<A, B> = A extends B ? true : false;

/** One driver, one schema map — the case where the two are structurally the same. */
type Schema = { widgets: { id: string } };
type Run = { changes: number };

type Replica = ReplicaDb<Run, Schema>;
type Outbox = OutboxDb<Run, Schema>;
type Plain = BaseSQLiteDatabase<"sync", Run, Schema>;

/* ── the swap does not compile ───────────────────────────────────────────── */

export type ReplicaIsNotOutbox = Expect<Not<Extends<Replica, Outbox>>>;
export type OutboxIsNotReplica = Expect<Not<Extends<Outbox, Replica>>>;

/** And the stores that carry them, which is the shape a migrator is handed. */
export type ReplicaStoreIsNotOutboxStore = Expect<
  Not<Extends<ReplicaStore<Run, Schema>, OutboxStore<Run, Schema>>>
>;
export type OutboxStoreIsNotReplicaStore = Expect<
  Not<Extends<OutboxStore<Run, Schema>, ReplicaStore<Run, Schema>>>
>;

/**
 * **The gap the brand actually closes.** An unbranded handle is what every
 * driver produces, and it must not satisfy either side — otherwise `open.ts`
 * could be bypassed by anyone who calls the driver directly, and the brand
 * would be a convention rather than a type.
 */
export type PlainIsNotReplica = Expect<Not<Extends<Plain, Replica>>>;
export type PlainIsNotOutbox = Expect<Not<Extends<Plain, Outbox>>>;

/* ── but a branded handle is still a database ────────────────────────────── */

/**
 * `writeLocally(ledger.replica.db, …)` has to keep working: it takes a
 * `BaseSQLiteDatabase` and infers `TRun` and `TSchema` from it, and a brand that
 * broke that inference would have bought type safety by making the type
 * unusable.
 */
export type ReplicaIsADatabase = Expect<Extends<Replica, Plain>>;
export type OutboxIsADatabase = Expect<Extends<Outbox, Plain>>;

/**
 * Non-vacuous, in both of the ways this file can lie.
 *
 * Every `Not<Extends<…>>` above is satisfied by `never` on the left, so if
 * `ReplicaDb` resolved to `never` — a plausible outcome of a mistake in the
 * intersection — the four negative assertions would all pass while proving
 * nothing at all. Naming a value of each type is what stops that.
 *
 * The declarations are `declare` rather than constructed: a real drizzle
 * database cannot be built in a type test, and building a fake one with a cast
 * would test the cast.
 */
declare const replica: Replica;
declare const outbox: Outbox;
export const inhabited: [Replica, Outbox] = [replica, outbox];

/**
 * And the positive direction is non-vacuous too: `Extends<never, Plain>` is
 * `true`, so `ReplicaIsADatabase` would also survive a collapse to `never`.
 * Reading a real member through the brand is what requires it to be a database.
 */
export const stillADatabase: Plain["transaction"] = replica.transaction;
