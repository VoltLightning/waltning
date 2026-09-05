/**
 * Type-level contract tests for the seam this app wires.
 *
 * Compile-time assertions, the same kind `apps/api/src/registry/
 * contract.types.ts` holds for the registry — they run in `pnpm -r
 * typecheck`, which the pre-commit hook gates on, and the file exports
 * nothing at run time. If it compiles, the contract holds. Named
 * `.type-test.ts` after this repo's own convention for a file that asserts
 * only in the type system (`open.type-test.ts`, `id.type-test.ts`).
 *
 * **Why here and not in either package.** `phone-ledger.native.ts` and
 * `phone-ledger.web.ts` pass `@waltning/ledger`'s `LocalLedgerSession`
 * straight in as `@waltning/client`'s `PhoneLedgerPort`, and the two sides
 * never meet in either package: `packages/client` stays free of
 * `@waltning/schema` on purpose, so it *restates* the enums it needs by hand
 * (`PhoneAuditEntry.actor`, `PhoneCounterparty.kind`) rather than importing
 * them. That restatement is the contract, and a restatement with nothing
 * checking it is a copy waiting to drift. This app is the one place that
 * holds both — the port's declared shape and the schema the ledger actually
 * answers from — so this is where the check belongs.
 *
 * **The drift this exists for happened.** A first version of the audit
 * reader declared its own actor union and *widened* it with a fifth member
 * (`system`, for §15.1's continuous invariants) that the `ACTOR` pgEnum does
 * not carry — a client-side type legitimising a value Postgres rejects. An
 * assertion against `@waltning/schema`'s own `Actor` fails on that the
 * moment it is written; one against `LocalAuditEntry["actor"]` would not,
 * because both sides would have moved together.
 */

import type { PhoneAuditEntry } from "@waltning/client/ledger/create-phone-ledger";
import type { LocalAuditEntry } from "@waltning/ledger/transactions/read-audit-log";
import type { Actor } from "@waltning/schema/enums";

type Expect<T extends true> = T;

/** Invariant equality — a widened or narrowed copy is not equal, which is the point. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/** The port's hand-restated actor union is exactly the shipped `ACTOR` enum. */
export type PhoneActorIsSchemaActor = Expect<Equals<PhoneAuditEntry["actor"], Actor>>;

/** And the reader that answers through it agrees, so the seam has no gap. */
export type LocalActorIsSchemaActor = Expect<Equals<LocalAuditEntry["actor"], Actor>>;
