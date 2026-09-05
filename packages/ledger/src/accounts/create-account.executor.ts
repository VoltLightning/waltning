/**
 * `create_account`, on the device.
 *
 * The first half of §14.7's *"two engines, one definition"*: this executor
 * writes the replica and reads `createAccountInput` from `@waltning/core`.
 * The later backend operation will consume that same contract rather than
 * introducing a second schema that merely agrees on the day it is written.
 *
 * Structural rather than offline-eligible in the registry's own terms
 * (`operations.md`, *Accounts*), which is a statement about **drain policy, not
 * about materialisation**: §14.6 is unambiguous that the phone always
 * materialises; backend availability decides only whether that materialisation
 * is provisional. An executor that refused to apply because the operation is
 * not offline-eligible would reintroduce the queue-shaped write §14.1 rejects
 * — a capture that is not visible until a server says so.
 */

import { type CreateAccountInput, createAccountInput } from "@waltning/core/registry/inputs";
import { defineLocalExecutor } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { accounts } = schema;

/**
 * The row as the replica holds it — every column, not a projection.
 *
 * A projection would be cheaper and would be the wrong contract: the caller of
 * `writeLocally` renders what it is handed, and §14.6's *"the phone always
 * materialises"* is only true if what comes back is the row a subsequent read
 * would find. Two shapes for one row is how a screen ends up refetching what it
 * already had.
 */
export type LocalAccountRow = typeof accounts.$inferSelect;

/**
 * The transaction handle a replica executor is written against.
 *
 * `TRun` — the driver's run-result — is `unknown` here because **this file has
 * no opinion about the driver**: `expo-sqlite` on the device, `better-sqlite3`
 * under Node, and nothing below ever looks at a run-result, because every
 * statement here ends in `.all()` rather than `.run()`. Pinning a concrete run
 * result would name a platform package in a package that must not
 * (`tests/architecture.test.ts`); making the executor a generic *factory* over
 * it would put a type parameter on every call site to describe a value no
 * caller reads. This is the project's sanctioned `unknown`: a type argument
 * in a position nothing consumes.
 *
 * `TSchema` is pinned, because that one is a real claim — these executors write
 * the replica's thirteen shared tables and no others.
 */
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const createAccountExecutor = defineLocalExecutor<
  typeof createAccountInput,
  LocalAccountRow,
  ReplicaTx
>({
  /**
   * **Byte-for-byte the server operation's name.** `recover.ts` looks an entry's
   * `operation` column up in the registry after a crash, so a name that drifts
   * does not fail loudly — it fails as `no local executor for "…"`, which blocks
   * replay of that entry and everything behind it.
   */
  operation: "create_account",
  opVersion: 1,
  input: createAccountInput,

  /**
   * One id: the account's own.
   *
   * The account is the only row this write brings into existence — a group is
   * `create_group`'s, and `openingBalance` is a column rather than an opening
   * transaction (§8.0 carries balances and their as-of date, not history). So a
   * transaction captured minutes later naming this `id` depends on **this**
   * entry, and `deriveDeps` can only see that because of this line.
   */
  mints: (input) => [input.id],

  // H2 — read-only, run before the outbox commits (`LocalExecutor.validate`'s
  // own doc): an opening balance past its own currency's scale is refused
  // the same way `insertAccount`'s own check already does, never queued as
  // an intent nothing will ever apply.
  validate: (input, tx) =>
    assertMoneyScale(tx, input.openingBalance, input.currency, "create_account: opening_balance"),

  apply: (input, tx) => insertAccount(input, tx),
});

/**
 * Insert the account, or overwrite the one already there.
 *
 * **An upsert, not an insert, and §14.6 names the reason:** *"replay is safe
 * because the ids are client-minted — the local apply is an upsert keyed on an
 * id the entry already carries, so twice is once."* The watermark normally makes
 * a double-apply impossible; a refetch that resets it while the outbox still
 * holds this entry is the case where it is not, and a primary-key violation
 * there would halt replay (`recover.ts`) over a row that is already correct.
 *
 * The conflict target is the primary key rather than `external_id`: the unique
 * index on `external_id` is §6.5's idempotency key for *re-running the
 * migration* (S29), which is a different question from *re-applying one entry*.
 * Keying on it would let a re-imported `.mmbak` silently overwrite an account
 * you had since edited by hand.
 */
function insertAccount(input: CreateAccountInput, tx: ReplicaTx): LocalAccountRow {
  // `SPEC.md` §7.2 — the local mirror of `assert_amount_scale`
  // (`0012_transaction_scale_and_category_kind.sql`): `opening_balance` fits
  // its own currency's declared decimals. Nothing else in this executor's
  // path (`createAccountInput`'s own `zMoney`) knows which currency's scale
  // applies — only a currency lookup, run here, can.
  assertMoneyScale(tx, input.openingBalance, input.currency, "create_account: opening_balance");

  // Built once and used twice — as the insert and as the conflict update — so
  // the two cannot describe different rows. A hand-written `set` is the shape
  // that goes stale the first time a column is added to the schema above it.
  const fields = {
    name: input.name,
    kind: input.kind,
    currency: input.currency,
    ownership: input.ownership,
    openingBalance: input.openingBalance,
    memo: input.memo,
    isBusiness: input.isBusiness,
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.openingDate !== undefined ? { openingDate: input.openingDate } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
  };

  const [row] = tx
    .insert(accounts)
    .values({ id: input.id, ...fields })
    .onConflictDoUpdate({ target: accounts.id, set: fields })
    .returning()
    .all();

  if (!row) {
    // Unreachable with a conforming driver. A throw rolls the replica half back
    // and leaves the outbox entry standing, which is the recoverable direction:
    // `recover.ts` replays it at the next launch (§14.6).
    throw new Error("create_account: the replica insert returned no row");
  }
  return row;
}
