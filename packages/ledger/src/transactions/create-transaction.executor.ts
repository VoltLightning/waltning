/**
 * `create_transaction`, on the device — *"the core write. One payment event,
 * one row"* (`operations.md`, §6.10).
 *
 * This executor writes the replica so the capture is on screen without a
 * backend (§14.1). The later Postgres operation will validate the same
 * `createTransactionInput` from `@waltning/core`, which is the whole of
 * §14.7's *"one definition"* — a second schema would agree until the day it
 * did not, and the disagreement would surface only after the phone had shown
 * the row as saved.
 *
 * **The hard part of this file is one NOT NULL column**, `fx_rate`, against a
 * spec sentence that says the client never stamps a rate. See
 * `provisionalFxRate` below, which is where that is resolved and argued.
 *
 * **C1/C2 — a missing rate must never cost you the transaction.**
 * `provisionalFxRate` prices every capture at the nearest rate this replica
 * holds for the row's own date, however far away that rate is
 * (`readNearestRate`, uncapped); it defers only when the pair has no
 * real-source rate at all (H1/H2 — never off an orphaned `carried_forward`
 * row) — never on distance, which is `readRate`'s cap and belongs to its
 * read-side callers, not to this write.
 */

import { resolveBrand } from "@waltning/core/brands/match";
import type { CurrencyCode, PivotPerUnit } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  type CreateTransactionInput,
  createTransactionInput,
} from "@waltning/core/registry/inputs";
import { eq } from "drizzle-orm";
import { readNearestRate } from "../currencies/read-rate.ts";
import { defineLocalExecutor, LocalDeferral, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { accounts, categories, currencies, transactions } = schema;

/** The row as the replica holds it. See `LocalAccountRow` for why not a projection. */
export type LocalTransactionRow = typeof transactions.$inferSelect;

/** See `accounts/create-account.executor.ts` for why `TRun` is `unknown` here. */
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const createTransactionExecutor = defineLocalExecutor<
  typeof createTransactionInput,
  LocalTransactionRow,
  ReplicaTx
>({
  /** Byte-for-byte the server operation's name — `recover.ts` looks it up by this. */
  operation: "create_transaction",
  opVersion: 1,
  input: createTransactionInput,

  /**
   * One id: the transaction's own.
   *
   * **Not the lines**, and not the destination leg. A transfer is one row
   * carrying both legs (§6.1/§7.5), so it mints one id however many accounts it
   * names; a split's lines are `set_transaction_lines`, a separate entry that
   * mints its own. `accountId`, `toAccountId`, `categoryId` and
   * `counterpartyId` are ids this write *names* rather than creates — they are
   * what `deriveDeps` matches against other entries' mints, which is the
   * opposite direction and is why declaring them here would be wrong: an
   * operation that claims to mint the account it spends from would make every
   * later write depend on this entry.
   */
  mints: (input) => [input.id],

  // R4 H1-r4 — read-only, run before the outbox commits (`LocalExecutor`'s
  // own doc): a fee (or either amount) past its own currency's scale is
  // refused the same way `zero destination`/`negative fee` already are,
  // never queued as an intent nothing will ever apply.
  validate: (input, tx) => assertTransactionScale(input, tx),

  apply: (input, tx) => insertTransaction(input, tx),
});

/**
 * **Exported.** `reconcile_account` (`accounts/reconcile-account.executor.ts`)
 * writes its one `adjustment` row through this same function, and
 * `supersede_transaction` (`supersede-transaction.executor.ts`) lands its
 * replacement row through it in the same write that soft-deletes the
 * original — one write path for the table, not three that can drift on which
 * columns default and which upsert on conflict.
 */
export function insertTransaction(
  input: CreateTransactionInput,
  tx: ReplicaTx,
): LocalTransactionRow {
  assertBusinessNotShared(input, tx);
  assertCategoryNotArchived(tx, input.categoryId, "create_transaction: category_id");
  // R4 re-review — restored. L10 had dropped this call on the theory that
  // `create_transaction`'s own `validate` already ran it, pre-outbox, on this
  // exact `input`, so a second call here would check nothing new — true only
  // while `validate` actually runs. `write.ts`'s own M3 ruling swallows
  // anything `validate` throws that is not a `LocalRefusal` (a driver fault,
  // a bug in the check itself) and lets the write proceed regardless, so a
  // `validate` that faults for a non-refusal reason must not leave the write
  // itself unchecked — the same reason `create-account.executor.ts`'s own
  // `insertAccount` and `set-transaction-lines.executor.ts`'s own
  // `replaceLines` each keep their check in both places. `settle_debt` and
  // `supersede_transaction` carry the identical duplication for their own
  // inputs; `reconcile_account` checks `observedBalance` itself, which bounds
  // the derived `difference` this function receives from it.
  assertTransactionScale(input, tx);

  /**
   * **`to_amount` is copied from the input and is never derived.** §14.6:
   * *"offline, a cross-currency transfer leaves the destination amount empty,
   * with the stale reference shown only as a hint. An unedited destination
   * amount is then impossible."* Pre-filling it from a cached rate values both
   * legs at the same pivot amount, so §7.5's margin comes out identically zero
   * for every transfer ever recorded — indistinguishable from a genuinely
   * fee-free one, and undetectable afterwards. The schema already enforces the
   * rest: `createTransactionInput` refuses a transfer with no `toAmount`, so a
   * capture with an empty destination fails to validate in `writeLocally`
   * before either store is touched.
   */
  const provisional = provisionalFxRate(input, tx);
  // `SPEC.md` §14.4b — resolved offline, from the bundled catalogue
  // (`@waltning/core/brands/match`), the same way `provisionalFxRate` above
  // resolves a rate the caller did not supply: an asserted `brandKey` wins
  // (already catalogue-validated at the Zod boundary); otherwise the payee
  // is matched, or the row carries neither field, never one alone.
  const brand = resolveBrand(input.payee, input.brandKey);
  const fields = {
    date: input.date,
    type: input.type,
    accountId: input.accountId,
    amountOriginal: input.amountOriginal,
    currency: input.currency,
    fxRate: provisional.rate,
    // H2 — set only when `provisionalFxRate` had to reach past carry-forward
    // (`readNearestRate`'s step 2): a carried rate within the ten-day cap is
    // the rate in effect on this date (§7.6's weekend/holiday row), not an
    // estimate, even though its own date differs from the row's.
    fxRateEstimated: provisional.estimated,
    payee: input.payee,
    note: input.note,
    brandKey: brand.brandKey,
    brandSource: brand.brandSource,
    isBusiness: input.isBusiness,
    isCapital: input.isCapital,
    source: input.source,
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.counterpartyId !== undefined ? { counterpartyId: input.counterpartyId } : {}),
    ...(input.counterpartyRole !== undefined ? { counterpartyRole: input.counterpartyRole } : {}),
    ...(input.toAccountId !== undefined ? { toAccountId: input.toAccountId } : {}),
    ...(input.toAmount !== undefined ? { toAmount: input.toAmount } : {}),
    ...(input.toCurrency !== undefined ? { toCurrency: input.toCurrency } : {}),
    /**
     * **Nullable, so nothing is invented for it.** `to_fx_rate` is the only
     * one of the four rates §14.6 names that the local schema lets us leave
     * unanswered, and an absent rate is the honest state: the server resolves
     * it at commit from the row's own date. Filling it from the cache would
     * feed `to_amount_pivot` on the valued view and corrupt the shared-boundary
     * netting in `computations.md` §5 — a headline figure.
     */
    ...(input.toFxRate !== undefined ? { toFxRate: input.toFxRate } : {}),
    ...(input.fee !== undefined ? { fee: input.fee } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
    // H2 — `fx_rate_estimated` is set above, from `provisionalFxRate`'s own
    // answer, whenever step 2 (not carry-forward) had to price the row.
    // §14.6 still applies past that: a synced backend re-derives it at
    // drain from the published series, replacing this guess with its own.
  };

  const [row] = tx
    .insert(transactions)
    .values({ id: input.id, ...fields })
    // An upsert for §14.6's replay rule — see `insertAccount` for the argument
    // and for why the conflict target is the primary key and not `external_id`.
    .onConflictDoUpdate({ target: transactions.id, set: fields })
    .returning()
    .all();

  if (!row) {
    throw new Error("create_transaction: the replica insert returned no row");
  }
  return row;
}

/**
 * `SPEC.md` §6.7: *a shared account is never business.*
 *
 * **The Postgres mirror, not a duplicate of it.** `0001_database_objects.sql`
 * (~L243, `assert_business_not_shared` and its transfer-target twin
 * `assert_business_not_shared_target`) is the guarantee's real home — a
 * trigger closes the hole no client can, someone writing straight to the
 * table. But the replica is SQLite with no cross-table trigger of its own
 * (`ddl.ts` states every `CHECK` this schema can enforce alone; a foreign
 * table's own column is not one of them), so a business row into a shared
 * account would sit on the phone, look saved, and only be caught the day a
 * backend drains it — the exact silent-until-sync failure §14.6 exists to
 * rule out. This is that check, run here instead: **every** row this table
 * receives passes through `insertTransaction` (`create_transaction`,
 * `reconcile_account`'s adjustment, `supersede_transaction`'s replacement),
 * so one check here covers what three triggers would on the server.
 */
function assertBusinessNotShared(input: CreateTransactionInput, tx: ReplicaTx): void {
  if (!input.isBusiness) return;

  if (isSharedAccount(tx, input.accountId)) {
    throw new LocalRefusal(
      "create_transaction: a business transaction cannot sit in a shared account (SPEC.md §6.7, §13.1)",
    );
  }
  if (input.toAccountId !== undefined && isSharedAccount(tx, input.toAccountId)) {
    throw new LocalRefusal(
      "create_transaction: a business transaction cannot move into a shared account (SPEC.md §6.7)",
    );
  }
}

/**
 * H1a — **no row in this replica may newly point at an archived category.**
 *
 * `transactions.category_id` was only ever half of that: `transaction_lines`
 * carries its own `category_id` (§10.3's split), and a split line is exactly
 * where a category nobody can see any more lands unnoticed — the parent row
 * shows a category the reader recognises while a line underneath it carries a
 * retired leaf.
 *
 * **The good error, between two guarantees.** Below it the replica's own four
 * `*_category_not_archived_insert` / `_update` triggers (`migrate.ts`'s
 * `objects` hook on the last step that rebuilds `transactions`, two per
 * table) and, on the server, `assert_category_not_archived`
 * (`0001_database_objects.sql`, SQLSTATE `WA019`, likewise on both tables)
 * refuse the same write — all broken once, in `transaction-ops.test.ts` and
 * `pg-errors.test.ts`. A trigger's message names no operation and no field;
 * `where` is how this one does, which is what an executor is for.
 *
 * **Exported, and called from every executor that can move a `category_id`**:
 * `update_transaction`'s patch, `set_transaction_lines`' every line, and
 * `categorize_batch`'s bulk `UPDATE` — the last one before the write rather
 * than after it, because that statement touches N rows at once and a refusal
 * arriving mid-batch would name no row in particular.
 *
 * A client-side refusal exists a layer up as well
 * (`create-phone-ledger.ts`'s own `categoryId === undefined` refusal, H1a),
 * which is the one a person actually reads — the same three-deep layering
 * `assertTransactionScale` has against `QuickAddForm`'s own amount check.
 */
export function assertCategoryNotArchived(
  tx: ReplicaTx,
  // `| null` past `CreateTransactionInput["categoryId"]`'s own type: only
  // `update_transaction`'s patch can ever explicitly clear a category, and
  // clearing one is never a category to check.
  categoryId: CreateTransactionInput["categoryId"] | null,
  /** The operation and the field this call is checking — `"set_transaction_lines: transaction_lines[l-1].category_id"`. */
  where: string,
): void {
  if (categoryId === null || categoryId === undefined) return;

  const [row] = tx
    .select({ archived: categories.archived })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1)
    .all();
  // The FK to `categories` already refuses an unknown id; a missing row here
  // means that check has not run yet in this same statement (`assert_category_
  // kind_matches_type`'s own Postgres comment makes the identical call).
  if (row?.archived) {
    throw new LocalRefusal(`${where}: category ${categoryId} is archived (H1a)`);
  }
}

/**
 * `SPEC.md` §7.2, the local mirror of `assert_amount_scale`
 * (`0011_transaction_scale_and_category_kind.sql`): `amount_original`,
 * `to_amount` and `fee` each fit their own currency's declared decimals.
 * `debt_amount`/`debt_currency` are not this executor's — `settle_debt`
 * (`counterparties/settle-debt.executor.ts`) is the only writer of those two
 * columns, and carries the identical check for them.
 *
 * **Exported.** `insertTransaction` no longer runs this itself (L10 — it
 * used to, which made `create_transaction`'s own `validate` and `apply`
 * check the identical `input` twice); each caller now runs it on the value
 * that is actually theirs to check. `create_transaction`'s own `validate`
 * (below) covers its call; `settle_debt`'s own `validate` covers its;
 * `reconcile_account` checks its *derived* `difference` explicitly, right
 * before calling `insertTransaction`; `supersede_transaction` — the one
 * caller with no `validate` of its own and a genuinely new, unvalidated
 * `replacement` — calls this directly for the same reason.
 */
export function assertTransactionScale(input: CreateTransactionInput, tx: ReplicaTx): void {
  assertMoneyScale(tx, input.amountOriginal, input.currency, "create_transaction: amount_original");
  if (input.toAmount !== undefined && input.toCurrency !== undefined) {
    assertMoneyScale(tx, input.toAmount, input.toCurrency, "create_transaction: to_amount");
  }
  if (input.fee !== undefined) {
    assertMoneyScale(tx, input.fee, input.currency, "create_transaction: fee");
  }
}

function isSharedAccount(tx: ReplicaTx, accountId: CreateTransactionInput["accountId"]): boolean {
  const [row] = tx
    .select({ ownership: accounts.ownership })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
    .all();
  return row?.ownership === "shared";
}

/**
 * The rate this row is valued at **until the server replaces it**.
 *
 * ─── What is provisional here, and what replaces it ───────────────────────
 *
 * Everything this function returns except the same-currency `1` is **the
 * phone's guess**, not the server's answer. The server resolves the real rate
 * from the row's own date at commit and the drain applies the canonical row
 * over this one wholesale (`architecture/08`, *"the canonical row first, the
 * entry's removal second"*), so the value below survives exactly as long as the
 * outbox entry naming this row does — which is also precisely how §14.6 defines
 * *provisional*, and why nothing stores a `provisional` column. **If you are
 * reading a rate on a row with no outbox entry, the server wrote it. If there
 * is an entry, this function did.**
 *
 * ─── Why the phone may stamp one at all ───────────────────────────────────
 *
 * §14.6's *"the client never stamps a rate"* was written against a database
 * where `amount_pivot` was a `GENERATED` column: a stale rate froze into a
 * stored figure with *"no mechanism at all"* to correct it. Both premises have
 * since gone — §14.7 moved the pivot columns onto the `transactions_valued`
 * view, so nothing materialises the guess, and the drain is the mechanism.
 * `fx_rate` is `NOT NULL` with no default, so the phone must write *something*;
 * what it must not do is write something that looks like an answer.
 *
 * **With no backend there is no drain, so nothing corrects this** — §14.6: a
 * phone-only materialisation is *"final. Nothing will ever correct it, because
 * there is nothing else that writes."* That is not the hole it looks like:
 * with no server there is also no published rate to be corrected *to*, so the
 * phone's last-known rate is not a guess standing in for an answer, it is the
 * answer. It remains only as good as the last sync of `fx_rates`.
 *
 * ─── The four cases ───────────────────────────────────────────────────────
 *
 * 1. **A supplied rate wins.** §7.6 level 1 — *"enter the rate your bank
 *    actually applied"*. That is an assertion about a settled fact, not a
 *    lookup, and it is the one rate the server has no better source for.
 * 2. **Same currency as the pivot: exactly `1`, and not an estimate.** There is
 *    no conversion to be wrong about.
 * 3. **Cross-currency: the rate nearest the replica holds for this row's own
 *    date** (H1/H2, C1/C2) — `readNearestRate`, uncapped, rather than "the
 *    newest row regardless of date". A back-dated capture is priced against
 *    a rate near *its* date, never today's, and `estimated` is true only
 *    when `readNearestRate` had to reach past carry-forward for it (step 2
 *    — carry exhausted, or nothing held at all): a weekend or holiday
 *    carried forward within the cap is the rate §7.6's table says is in
 *    effect on this date, not an estimate, however far its own date is from
 *    this row's. `readRate`'s ten-day cap gates only step 1's carry-forward
 *    walk here, exactly as it does for its read-side callers (S18,
 *    reference figures); step 2 remains uncapped.
 * 4. **No rate at all for the pair: defer.** Argued below.
 */
/**
 * L4 — `daysAway` rides alongside `estimated` for the same reason
 * `NearestRate.daysAway` exists: a boolean cannot tell "estimated by one
 * day" from "estimated by 2,342". `0` for a supplied rate (case 1) and the
 * same-currency `1` (case 2); `readNearestRate`'s own `daysAway` for a
 * resolved cross-currency rate (case 3). Not persisted — no transactions
 * column holds it and no screen reads it yet; it exists so a later
 * diagnostic (S18/S30) can surface it without a second query, the same
 * intent as `NearestRate.daysAway`.
 */
type ProvisionalFxRate = { rate: PivotPerUnit; estimated: boolean; daysAway: number };

function provisionalFxRate(input: CreateTransactionInput, tx: ReplicaTx): ProvisionalFxRate {
  if (input.fxRate !== undefined) return { rate: input.fxRate, estimated: false, daysAway: 0 };

  const pivot = pivotCurrency(tx);

  if (pivot === undefined) {
    // A replica with no pivot currency cannot answer "how many pivots is one of
    // these?" for *any* currency, including the transaction's own — `1` would
    // only be right if this currency happened to be the pivot, which is the
    // fact that is missing. Deferring is the same branch as case 4.
    throw new LocalDeferral(
      "create_transaction: no pivot currency in the replica, so no rate can be resolved — " +
        "the intent remains in the outbox for a later backend to value",
    );
  }

  // `1`, at storage scale rather than as the literal string. `pivotPerUnit`
  // produces the twelve places `numeric(24,12)` holds, so the same value read
  // back from either engine compares equal as a string.
  if (input.currency === pivot) {
    return { rate: money.pivotPerUnit("1"), estimated: false, daysAway: 0 };
  }

  const local = readNearestRate(tx, { base: pivot, quote: input.currency, date: input.date });

  if (local === undefined) {
    /**
     * **Defer, rather than write `1`.**
     *
     * `1` for a cross-currency row is a *wrong figure that looks right*: it
     * silently values a 4 000 PLN expense as 4 000 USD in every pivot total on
     * the dashboard, and nothing about the row says it was guessed. `0` is
     * worse — it zeroes the same totals and passes every CHECK. `NULL` is not
     * available; the column forbids it.
     *
     * So this throws, and **the throw is not a lost capture**: `writeLocally`
     * commits the outbox entry *before* it calls `apply` (§14.6 — intent first,
     * because it is the half that cannot be reconstructed), so what remains is
     * an entry whose row is missing. That is the ordinary crash window: the
     * capture still drains to a server that can resolve the rate properly.
     *
     * **`LocalDeferral`, not `LocalRefusal` (R3 H1).** The missing rate is
     * local state, not a business rule the input violates, and that gap
     * closes on its own the moment a rate arrives, whether from a fresh sync
     * or the server that eventually drains this entry. `write.ts` leaves the
     * entry `pending` rather than `blocked(refused)` for exactly that reason:
     * a refusal never gets retried. **R4 C2** — it also marks
     * `disposition: "deferred"`, so `recover.ts`'s `outstanding` query keeps
     * finding this entry at every launch even once a later write has pushed
     * the watermark past it, until this branch stops throwing.
     *
     * **C1/C2/H2 — the only reachable case is "no real-source row for this
     * pair at all".** `readNearestRate` is uncapped, so a back-dated capture
     * 31 days from the only held row still resolves (case 3,
     * `estimated: true`) rather than landing here; this branch is a currency
     * added to the ledger while the phone was offline, with no real-source
     * rate row yet for the pair — exactly what `readCurrencies.capturable`
     * already checks for, date-blind, so a screen can decline the capture
     * before ever reaching this throw. H1/H2 made this the *only* reachable
     * case: `readNearestRate` compares real-source candidates on both sides
     * of the date, so a pair holding a real row plus an orphaned
     * `carried_forward` row nearer this date's own capture no longer throws
     * here — it resolves off the real row instead, the same as `capturable`
     * already promised. It is not the same as "the rate is stale", which is
     * case 3 and is fine.
     */
    throw new LocalDeferral(
      `create_transaction: no last-known rate for ${pivot}/${input.currency}, and a ` +
        "cross-currency row must not be valued at 1 — the intent remains in the outbox " +
        "for a later backend to value",
    );
  }

  /**
   * **Flipped once, here, at the boundary.**
   *
   * `fx_rates.rate` is **units per pivot** — you divide by it (`computations.md`
   * §4) — and `transactions.fx_rate` is **pivot per unit**, which you multiply
   * by. They are reciprocals, both are called *rate* in prose, and confusing
   * them produced a 14.1× error (H21), which is why the two brands exist and
   * why this line will not compile the other way round. `money.reciprocal` is
   * the only sanctioned crossing, and it is called once: a rate lives at twelve
   * decimal places, so flipping back cannot recover what truncation removed.
   */
  return {
    // H2 — `estimated` follows `readNearestRate`'s own step, never
    // `asOf !== input.date`: a weekend or holiday carried forward within the
    // ten-day cap (step 1, `inEffect: true`) is the rate in effect on this
    // date per §7.6's table, not an estimate, even though its `asOf` is a
    // different day. Only a rate step 2 had to reach for — carry-forward
    // exhausted or nothing held at all — is an estimate.
    rate: money.reciprocal(local.rate),
    estimated: !local.inEffect,
    daysAway: local.daysAway,
  };
}

/**
 * The pivot currency, read out of the replica rather than assumed.
 *
 * Hard-coding `USD` was the alternative and it is a second place holding a fact
 * the `currencies_one_pivot` index already owns — §7.0 supports changing the
 * pivot, and a constant here would keep pricing captures against the old one
 * long after the server stopped.
 */
function pivotCurrency(tx: ReplicaTx): CurrencyCode | undefined {
  const [row] = tx
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isPivot, true))
    .limit(1)
    .all();
  return row?.code;
}
