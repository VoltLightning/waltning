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
 */

import type { CurrencyCode, PivotPerUnit } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  type CreateTransactionInput,
  createTransactionInput,
} from "@waltning/core/registry/inputs";
import { and, desc, eq } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { currencies, fxRates, transactions } = schema;

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

  apply: (input, tx) => insertTransaction(input, tx),
});

function insertTransaction(input: CreateTransactionInput, tx: ReplicaTx): LocalTransactionRow {
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
  const fields = {
    date: input.date,
    type: input.type,
    accountId: input.accountId,
    amountOriginal: input.amountOriginal,
    currency: input.currency,
    fxRate: provisionalFxRate(input, tx),
    payee: input.payee,
    note: input.note,
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
    // `fx_rate_estimated` is deliberately not set. §14.6: the server writes it
    // at drain, iff no published rate existed for that date — "the only moment
    // the question can be answered correctly". The column's own `false` default
    // stands in the meantime and is replaced with the rest of the row.
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
 * 3. **Cross-currency: the last-known rate for the pair**, which is the one use
 *    `SPEC.md` §14.5 keeps those rows in the replica for — *"last-known rate
 *    per currency pair, for pricing a new capture"*.
 * 4. **No rate at all: refuse.** Argued below.
 */
function provisionalFxRate(input: CreateTransactionInput, tx: ReplicaTx): PivotPerUnit {
  if (input.fxRate !== undefined) return input.fxRate;

  const pivot = pivotCurrency(tx);

  if (pivot === undefined) {
    // A replica with no pivot currency cannot answer "how many pivots is one of
    // these?" for *any* currency, including the transaction's own — `1` would
    // only be right if this currency happened to be the pivot, which is the
    // fact that is missing. Refusing is the same branch as case 4.
    throw new Error(
      "create_transaction: no pivot currency in the replica, so no rate can be resolved — " +
        "the intent remains in the outbox for a later backend to value",
    );
  }

  // `1`, at storage scale rather than as the literal string. `pivotPerUnit`
  // produces the twelve places `numeric(24,12)` holds, so the same value read
  // back from either engine compares equal as a string.
  if (input.currency === pivot) return money.pivotPerUnit("1");

  const rate = lastKnownRate(tx, pivot, input.currency);

  if (rate === undefined) {
    /**
     * **Refuse, rather than write `1`.**
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
     * capture still drains to a server that can resolve the rate properly, and
     * `recover.ts` marks the entry `blocked(terminal)` with this message for
     * S30 to render — *"blocked local replay is not the same as blocking the
     * drain"*. A visible refusal naming the missing pair beats an invisible row
     * that is off by the exchange rate.
     *
     * The case is reachable: a currency added to the ledger while the phone was
     * offline has no rate row yet. It is not the same as "the rate is stale",
     * which is case 3 and is fine.
     */
    throw new Error(
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
  return money.reciprocal(rate);
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

/**
 * The most recent rate the replica holds for one pair.
 *
 * **Deliberately not filtered to the transaction's own date.** §14.5 mirrors
 * *last-known* rates only — historical rates are not on the device at all,
 * because each row already carries its server-computed display amount — so a
 * `date <= input.date` filter would return nothing for any back-dated capture
 * and refuse a write that has a perfectly good provisional answer. The date
 * question is the server's, which has the published series; this one is *"what
 * is this currency worth, as far as this phone knows"*.
 *
 * Rates are stored one way only, `(base = pivot, quote = X)` (§4), and both
 * halves are stated in the `where` rather than trusting the invariant — a row
 * quoted the other way round would otherwise be read as if it were this one,
 * which is the 14.1× error again with no type to catch it.
 */
function lastKnownRate(tx: ReplicaTx, pivot: CurrencyCode, quote: CurrencyCode) {
  const [row] = tx
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, pivot), eq(fxRates.quote, quote)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .all();
  return row?.rate;
}
