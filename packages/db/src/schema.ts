/**
 * Waltning ledger schema.
 *
 * NOTE: migrations 0001 and 0002 are generated but NOT yet applied — see
 * SPEC.md §6.5. 0002 is hand-written, because triggers are database behaviour
 * rather than schema and no ORM generates them.
 *
 * Six deliberate departures from Money Manager, each fixing a defect visible in
 * the 7,874-row backup or a limit its model could not express:
 *
 *  1. Stable UUIDs. Money Manager keys on display names, which produced 15
 *     categories with trailing spaces and accounts split across `ł` and `l`.
 *     Names here are display-only; uniqueness is on the normalized form.
 *  2. Transfers are ONE row with two accounts and BOTH amounts, so the realized
 *     rate is a fact rather than something derived from a reference rate.
 *  3. No main currency. Rates are stored against a USD pivot; the display
 *     currency is a client preference, so changing it moves nothing.
 *  4. Counterparties are entities. Debt was eleven accounts sliced by currency
 *     and direction, which could not express one person owing in two.
 *  5. Ownership. A jointly-owned account is real and can go negative; it simply
 *     belongs to a different total.
 *  6. Income is what you earned. Gifts, refunds and repayments raise a balance
 *     without being income.
 *
 * See SPEC.md §6–§7 for the reasoning behind each.
 */

import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Money. `numeric` is exact; scale 8 accommodates crypto balances. */
const money = (name: string) => numeric(name, { precision: 20, scale: 8 });

/** Normalized name for uniqueness: case- and whitespace-insensitive. */
const normalized = (col: AnyPgColumn): SQL => sql`lower(btrim(${col}))`;

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * The conflict token (`architecture/14` §14.2).
 *
 * **Not `updated_at`.** §14.2 requires the token be compared for *equality* —
 * "did this field change under you since you read it?" — and never ranked. A
 * timestamp answers that question correctly and invites the wrong one: two
 * rows' `updated_at` can be ordered, so someone eventually orders them, and a
 * phone offline for nine days lands an edit older than a correction another
 * device already synced. That is the clock-merge `08` spends a section
 * refusing. A bigint cannot be misread as a time.
 *
 * Advanced by `touch_row_versioned()` from `OLD.version`, never from `NEW` — a
 * client cannot set it, only carry back the one it last read. `updated_at`
 * survives alongside it for display ("last edited"), which is the job it is
 * actually good at.
 *
 * `mode: "number"` because 2^53 row updates is not a reachable number and a
 * `bigint` here would push `BigInt` into every client that reads a row.
 */

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/**
 * **The enums live in `@waltning/schema` now, and are re-exported here.**
 *
 * Postgres has a real `ENUM` type and SQLite has none, so the same column was
 * a `pgEnum` here and a plain `text` there — which meant the same column had
 * two different row types, `"income" | "expense" | …` on the server and
 * `string` on the phone. Nothing connected the two declarations, so
 * `parity.type-test.ts` could not see the divergence it exists to prevent.
 *
 * One value set now feeds both dialects: `pgEnum(name, VALUES)` here,
 * `text(name, { enum: VALUES })` on SQLite. Drizzle infers the same union from
 * each, so the row types match *and* the server keeps its compile-time check.
 *
 * Re-exported rather than moved-and-forgotten so every existing import of
 * `txnType` from this module still resolves — the enums did not change, only
 * where they are declared.
 */
import {
  accountKind,
  actor,
  categoryKind,
  counterpartyKind,
  counterpartyRole,
  fxSource,
  importRowStatus,
  ownership,
  taxLineKind,
  txnSource,
  txnType,
  widgetSize,
} from "@waltning/schema/enums-pg";
import { accountGroupsColumns } from "@waltning/schema/pg/account-groups";
import { accountsColumns } from "@waltning/schema/pg/accounts";
import { categoriesColumns } from "@waltning/schema/pg/categories";
import { counterpartiesColumns } from "@waltning/schema/pg/counterparties";
import { counterpartyDistinctPairsColumns } from "@waltning/schema/pg/counterparty-distinct-pairs";
import { counterpartyMergesColumns } from "@waltning/schema/pg/counterparty-merges";
import { currenciesColumns } from "@waltning/schema/pg/currencies";
import { dashboardLayoutsColumns } from "@waltning/schema/pg/dashboard-layouts";
import { dashboardWidgetsColumns } from "@waltning/schema/pg/dashboard-widgets";
import { fxRatesColumns } from "@waltning/schema/pg/fx-rates";
import { recurringTransactionsColumns } from "@waltning/schema/pg/recurring-transactions";
import { tagsColumns } from "@waltning/schema/pg/tags";
import { transactionLinesColumns } from "@waltning/schema/pg/transaction-lines";
import { transactionTagsColumns } from "@waltning/schema/pg/transaction-tags";
import { transactionsColumns } from "@waltning/schema/pg/transactions";

// Imported for the tables below *and* re-exported, because every existing
// consumer imports its enums from the same module as its tables.
export {
  accountKind,
  actor,
  categoryKind,
  counterpartyKind,
  counterpartyRole,
  fxSource,
  importRowStatus,
  ownership,
  taxLineKind,
  txnSource,
  txnType,
  widgetSize,
};

/* ------------------------------------------------------------------ *
 * Currencies and FX
 * ------------------------------------------------------------------ */

/**
 * **The columns come from `@waltning/schema`; the constraints stay here.**
 *
 * §14.7's rule: what a shared column *is* belongs to the shared module, and
 * everything Postgres can do that SQLite cannot — checks, partial indexes,
 * generated columns, triggers — layers around it here. Two declarations of the
 * same column was how `rate_source` came to exist on the server and not in the
 * shared set, unnoticed, because the parity assertion compares the two dialects
 * against each other and neither against this file.
 */
export const currencies = pgTable("currencies", currenciesColumns(), (t) => [
  // Exactly one pivot. There is deliberately no equivalent constraint on a
  // reporting currency, because none exists.
  uniqueIndex("currencies_one_pivot").on(sql`(true)`).where(sql`${t.isPivot}`),
  check("currencies_decimals_sane", sql`${t.decimals} between 0 and 8`),
]);

/**
 * Daily reference rates, all quoted against the pivot — verified available from
 * 2020-11-25 for every currency in use (§7.7). Any other pair derives by
 * triangulation, which is what makes an arbitrary display currency free.
 */
export const fxRates = pgTable("fx_rates", fxRatesColumns(), (t) => [
  // A real primary key: (base, quote, date) *is* the identity of a rate. The
  // unique constraint already builds the btree that lookups use, so a
  // separate index on the same columns would be pure duplication —
  // `readCoverage`'s aggregate filters `base = ? and quote = ?`, an equality
  // on the PK's own two leading columns, and is served by this same btree as
  // a prefix seek. No second index earns its place beside it (M5).
  primaryKey({
    name: "fx_rates_pk",
    columns: [t.base, t.quote, t.date],
  }),
  check("fx_rates_rate_positive", sql`${t.rate} > 0`),
  check("fx_rates_distinct", sql`${t.base} <> ${t.quote}`),
]);

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export const accountGroups = pgTable("account_groups", accountGroupsColumns(), (t) => [
  uniqueIndex("account_groups_name_uq").on(normalized(t.name)),
]);

export const accounts = pgTable("accounts", accountsColumns(), (t) => [
  uniqueIndex("accounts_name_uq").on(normalized(t.name)),
  uniqueIndex("accounts_external_id_uq").on(t.externalId).where(sql`${t.externalId} is not null`),
  index("accounts_kind_idx").on(t.kind),
  index("accounts_ownership_idx").on(t.ownership),
  // Shared money is never reportable (§13).
  check("accounts_shared_not_business", sql`${t.ownership} = 'own' or ${t.isBusiness} = false`),
]);

/* ------------------------------------------------------------------ *
 * Categories — groups and leaves, never both
 * ------------------------------------------------------------------ */

export const categories = pgTable("categories", categoriesColumns(), (t) => [
  /**
   * Sibling names unique within a parent, per kind. Postgres treats NULLs as
   * distinct in unique indexes, so top-level categories need coalesce to be
   * constrained at all.
   */
  uniqueIndex("categories_sibling_uq").on(
    sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    t.kind,
    normalized(t.name),
  ),
  uniqueIndex("categories_external_id_uq").on(t.externalId).where(sql`${t.externalId} is not null`),
  index("categories_parent_idx").on(t.parentId),
  check("categories_no_self_parent", sql`${t.id} <> ${t.parentId}`),
  // Earnings is an income-side concept only.
  check("categories_earnings_income_only", sql`${t.kind} = 'income' or ${t.isEarnings} = false`),
]);

/** Old Money Manager category → new taxonomy. Translation, not fidelity. */
export const categoryMappings = pgTable(
  "category_mappings",
  {
    externalId: text("external_id").primaryKey(),
    externalPath: text("external_path").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    note: text("note"),
  },
  (t) => [index("category_mappings_category_idx").on(t.categoryId)],
);

/* ------------------------------------------------------------------ *
 * Counterparties — §6.6
 * ------------------------------------------------------------------ */

/**
 * The Unicode whitespace set JS's `String.prototype.trim()` strips, as a
 * `btrim()` character argument.
 *
 * **R3 M1.** `btrim("name")` with no explicit charset trims ASCII space only
 * — confirmed on Postgres 16, `btrim(E'Name\t')` keeps the tab. JS `.trim()`
 * drops it, along with NBSP and every other Unicode `White_Space` character.
 * A raw insert of a tab- or NBSP-padded name therefore used to fold
 * differently on the two engines even though the app path is already safe
 * (`z.string().trim()` on every name-bearing input). `FOLD_SQL` below no
 * longer calls `btrim` at all — trimming an untrimmed name would still let it
 * *through*, silently disagreeing with `fold()`'s stricter idea of trimmed,
 * so the `counterparties_name_trimmed` CHECK this constant also builds
 * refuses an untrimmed name outright instead. ASCII space/tab/newline/
 * vertical-tab/form-feed are the `E'…'` half; everything else JS treats as
 * whitespace — NBSP, the Unicode space separators, the line/paragraph
 * separators, and the BOM — is the `U&'…'` half, `\XXXX` being Postgres's
 * four-hex-digit Unicode string escape.
 *
 * **Vertical tab is `\x0B`, not `\v` (R4 C1).** Postgres's `E'…'` escapes
 * recognise `\b \f \n \r \t` plus the numeric forms (`\xh`, `\ooo`, `\uxxxx`,
 * `\Uxxxxxxxx`) — there is no `\v`. Under "any other character following a
 * backslash is taken literally", `E'\v'` is just the letter `v`. Confirmed
 * live: with the old text, `btrim('Ivanov', charset)` came back `'Ivano'`
 * — the trailing `v` read as whitespace — so `counterparties_name_trimmed`
 * refused `Ivanov`, `Lev`, `van der Berg`, any name touching the letter `v`
 * at an edge. Meanwhile U+000B itself was absent from the charset, so a
 * name genuinely padded with a vertical tab passed the CHECK and folded
 * differently from `fold()`, which does treat U+000B as whitespace.
 * `\x0B` is Postgres's hex-escape form and needs no `U&` half.
 */
export const JS_TRIM_CHARSET_SQL =
  `E' \\t\\n\\r\\x0B\\f' || U&'\\00A0\\1680\\2000\\2001\\2002\\2003` +
  `\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'`;

/**
 * `name_folded`'s Postgres-only fold, reused by the migration's collision
 * pre-check (R2 M2) as well as this column's own `GENERATED ALWAYS AS`.
 * Kept as one string, not retyped in two places: the migration is
 * hand-checked SQL and cannot `import` this, but a reviewer comparing them
 * can at least diff identical text.
 *
 * **`normalize(…, NFC)` first (R2 H1).** Without it this expression folded
 * without normalising, so an NFD *Józef* — `o` plus a combining acute, the
 * form some IMEs and iOS's own text fields produce — was admitted here while
 * `@waltning/core/capture/names`'s `fold()` (which does `normalize("NFC")`
 * before anything else) refused the identical name on the phone: one engine
 * enforced `counterparties_name_uq`, the other did not. `normalize()` on
 * `text` has been IMMUTABLE since Postgres 13, same as `lower()`/
 * `translate()`/`btrim()` under this database's collation
 * (`docker-compose.yml`'s `--icu-locale=und-x-icu`) — checked directly
 * against a live instance before committing to this over a trigger.
 *
 * **No `btrim(…)` around `"name"` (R3 M1).** It used to open with
 * `btrim("name")`, which only strips ASCII space and so silently disagreed
 * with `fold()`'s full-Unicode-whitespace `.trim()` on a tab- or
 * NBSP-padded name. Folding an untrimmed name — with whatever charset —
 * would still be *a* fold, just not the one the phone computed for the
 * identical input, and the two would keep disagreeing for some future
 * whitespace character neither list happens to name. So this fold no
 * longer trims at all: `counterparties_name_trimmed` below refuses an
 * untrimmed `name` before this expression ever runs on it, and every row
 * this function does see is already the trimmed string `fold()` folds too.
 */
export const FOLD_SQL = `lower(translate(normalize("name", NFC), 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz'))`;

export const counterparties = pgTable(
  "counterparties",
  {
    // R3 L2 — `nameFolded` below **must follow** this spread, not precede it:
    // `counterpartiesColumns()` (`packages/schema/src/counterparties.pg.ts`)
    // already declares a plain, app-written `nameFolded`, for parity with the
    // SQLite table that has no generated columns to declare instead. Object
    // literals resolve a repeated key to its *last* occurrence, so the
    // `generatedAlwaysAs` column below silently replaces the shared plain one
    // — correctly, but only because of where it sits in this list. Swapping
    // the two would compile and would build a `counterparties` table whose
    // `name_folded` is the app-written kind Postgres does not need.
    ...counterpartiesColumns(),
    /**
     * `GENERATED ALWAYS AS (…) STORED`, not app-written (R2 H2).
     *
     * The shared column (`counterparties.pg.ts`) is a plain `text` — SQLite
     * has no generated columns (`packages/ledger`'s kit says so directly:
     * "This table is the one exception to 'constraints stay in
     * `packages/db`.'"), so the replica keeps writing it at capture time,
     * the only place it *can* be kept honest offline. Postgres does not
     * share that limit: a raw `insert into counterparties` that skipped
     * `name_folded` — or supplied a stale one — used to write straight
     * past `counterparties_name_uq` and nothing caught it. Generated here
     * instead, so the column cannot exist without being this fold of
     * `name`, ever, regardless of what wrote the row. `FOLD_SQL`'s own
     * comment above covers why every function in it is IMMUTABLE.
     */
    nameFolded: text("name_folded").notNull().generatedAlwaysAs(sql.raw(FOLD_SQL)),
  },
  (t) => [
    // R2 C1/M3 — indexed on `name_folded` rather than `normalized(t.name)`:
    // the two engines now share one normalisation, `fold()`, instead of
    // Postgres enforcing a stricter rule than the SQLite replica that
    // captures offline can check. Partial, excluding archived rows, so an
    // old name is free for reuse once its owner is archived (§9.2 —
    // history stays under the old row).
    uniqueIndex("counterparties_name_uq").on(t.nameFolded).where(sql`not ${t.archived}`),
    // R3 M1 — the engine half of the fix, alongside `FOLD_SQL` dropping
    // `btrim`: a `name` that is not already trimmed to JS `.trim()`'s exact
    // definition of trimmed is refused here, outright, rather than folded
    // under some charset that quietly disagrees with `fold()`. See
    // `JS_TRIM_CHARSET_SQL` above for what "trimmed" means.
    check(
      "counterparties_name_trimmed",
      sql`${t.name} = btrim(${t.name}, ${sql.raw(JS_TRIM_CHARSET_SQL)})`,
    ),
  ],
);

/**
 * `merge_counterparties` / `unmerge_counterparties` — S15 §9.2. The record of
 * which transactions moved, so unmerge reverses exactly them rather than
 * re-deriving the set.
 *
 * **M2**: `winner <> loser` — the executor's own `mergeCounterpartiesInput`
 * refine already refuses this, but a CHECK holds regardless of the caller.
 * **R2 H2**: the partial unique index on an open merge's `loser_id` refuses a
 * counterparty being absorbed by two merges at once — one half of "a chained
 * merge reverses into the wrong owner"; the other half (a winner or loser
 * reappearing on *either* side of an open merge) is the executor's own
 * pre-check, which this index cannot express alone.
 */
export const counterpartyMerges = pgTable(
  "counterparty_merges",
  counterpartyMergesColumns(),
  (t) => [
    index("counterparty_merges_winner_idx").on(t.winnerId),
    index("counterparty_merges_loser_idx").on(t.loserId),
    check("counterparty_merges_winner_ne_loser", sql`${t.winnerId} <> ${t.loserId}`),
    uniqueIndex("counterparty_merges_loser_open_uq")
      .on(t.loserId)
      .where(sql`${t.unmergedAt} is null`),
  ],
);

/**
 * `record_distinct_counterparties` — S15 §9.1's *these are different*
 * decision, so `MatchWarning` never asks about the same pair twice.
 *
 * Ordered `a_id < b_id`: a pair has no direction, and the CHECK is what makes
 * the composite primary key actually dedupe regardless of which counterparty
 * a caller named first.
 */
export const counterpartyDistinctPairs = pgTable(
  "counterparty_distinct_pairs",
  counterpartyDistinctPairsColumns(),
  (t) => [
    primaryKey({ columns: [t.aId, t.bId] }),
    check("counterparty_distinct_pairs_ordered", sql`${t.aId} < ${t.bId}`),
  ],
);

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */

/**
 * **The two pivot columns left this table** (§14.7).
 *
 * They were `GENERATED ALWAYS ... STORED`, which SQLite has no equivalent for —
 * so under the rule that Postgres adds power *around* a shared table and never
 * inside it, the multiplication moved to the `transactions_valued` view in
 * `0005`. `computations.md` is unchanged; only where it happens moved.
 *
 * Everything Postgres does that SQLite cannot — nine indexes, the foreign-key
 * behaviours, every check — still layers around the shared columns here.
 */
export const transactions = pgTable("transactions", transactionsColumns(), (t) => [
  index("transactions_date_idx").on(t.date),
  index("transactions_account_date_idx").on(t.accountId, t.date),
  index("transactions_category_idx").on(t.categoryId),
  index("transactions_to_account_idx").on(t.toAccountId),
  index("transactions_counterparty_idx").on(t.counterpartyId),
  index("transactions_payee_idx").on(t.payee),
  index("transactions_capital_idx").on(t.isCapital).where(sql`${t.isCapital}`),
  // Excludes soft-deleted rows: otherwise deleting an imported row makes its
  // external_id permanently unusable, and the blocking row is invisible in
  // every read path (§6.9).
  uniqueIndex("transactions_external_id_uq")
    .on(t.externalId)
    .where(sql`${t.externalId} is not null and ${t.deletedAt} is null`),
  // A recurring rule fills each occurrence exactly once. If you already
  // entered this month's rent by hand, the rule's insert is rejected.
  uniqueIndex("transactions_occurrence_uq")
    .on(t.recurringId, t.occurrenceDate)
    .where(sql`${t.recurringId} is not null and ${t.deletedAt} is null`),

  // Adjustments carry their own sign: reconciling an account DOWNWARD is the
  // ordinary use, and every other type takes direction from `type` (§7.2).
  // H4 — strictly positive, zero included in the refusal: `money.margin`
  // divides by `amount_pivot = amount_original × fx_rate`, and a zero
  // income/expense/transfer amount is not a payment event to begin with
  // (§6.10). An adjustment may still reconcile to an unchanged balance.
  //
  // M1 — the migration that tightened this from `>= 0` (`0014_…sql`) adds it
  // `NOT VALID`: existing zero-amount rows are grandfathered, new ones are
  // refused immediately. `drizzle-kit generate` cannot express `NOT VALID`,
  // so a future regeneration of that migration must have it hand-added back.
  check("transactions_amount_positive", sql`${t.amountOriginal} > 0 or ${t.type} = 'adjustment'`),
  // L3 — the CHECK above justifies itself by naming `fx_rate` in
  // `amount_pivot = amount_original × fx_rate`, but until now nothing
  // enforced `fx_rate` itself: `fx_rates.rate` has `fx_rates_rate_positive`
  // (above), and the reciprocal crossing at the write boundary
  // (`create-transaction.executor.ts`, `money.reciprocal`) refuses a result
  // that rounds to zero at twelve places (`money.ts`), but neither stops a
  // zero from landing here through a caller-asserted rate (§7.6 level 1),
  // which is never derived and so never passes through `reciprocal` at all.
  // `IS NULL OR` even though the column is `NOT NULL` — the same shape
  // `fx_rates_rate_positive` and every other nullable-safe CHECK in this
  // file use, so the constraint reads the same regardless of whether the
  // column ever becomes optional.
  check("transactions_fx_rate_positive", sql`${t.fxRate} is null or ${t.fxRate} > 0`),
  check(
    "transactions_transfer_shape",
    sql`(${t.type} = 'transfer') = (${t.toAccountId} is not null)`,
  ),
  check(
    "transactions_transfer_distinct",
    sql`${t.toAccountId} is null or ${t.toAccountId} <> ${t.accountId}`,
  ),
  // Both amounts, or neither — a half-specified transfer is a silent bug.
  check(
    "transactions_to_amount_shape",
    sql`(${t.type} = 'transfer') = (${t.toAmount} is not null)`,
  ),
  // H3 — a zero destination amount is a transfer that moves nothing into the
  // other leg; `>= 0` let it through end to end (§7.5's shape only asks the
  // two legs be *present* together, never that either be non-empty).
  check("transactions_to_amount_positive", sql`${t.toAmount} is null or ${t.toAmount} > 0`),
  // The destination leg's pivot value is computed as to_amount × to_fx_rate
  // (§7.4), so a transfer missing either is a balance that comes out silently
  // wrong rather than a write that fails.
  check(
    "transactions_to_currency_shape",
    sql`(${t.type} = 'transfer') = (${t.toCurrency} is not null)`,
  ),
  check(
    "transactions_to_fx_rate_shape",
    sql`(${t.type} = 'transfer') = (${t.toFxRate} is not null)`,
  ),
  check(
    "transactions_category_shape",
    sql`(${t.type} in ('income', 'expense')) or ${t.categoryId} is null`,
  ),
  // A counterparty reference must say what it means, and a role without a
  // counterparty is meaningless.
  check(
    "transactions_counterparty_role_shape",
    sql`(${t.counterpartyId} is not null) = (${t.counterpartyRole} is not null)`,
  ),
  check(
    "transactions_occurrence_shape",
    sql`(${t.recurringId} is null) = (${t.occurrenceDate} is null)`,
  ),
  // H3 — a negative fee used to store: `zMoney` alone accepts any sign, and
  // the app-level refine is not itself a guarantee. Zero is never valid
  // either — a typed `0` fee is "no fee", and the app drops it to `null`
  // before the write ever reaches here.
  check("transactions_fee_positive", sql`${t.fee} is null or ${t.fee} > 0`),
]);

export const tags = pgTable("tags", tagsColumns(), (t) => [
  uniqueIndex("tags_name_uq").on(normalized(t.name)),
]);

export const transactionTags = pgTable(
  "transaction_tags",
  transactionTagsColumns({ transactionId: () => transactions.id }),
  (t) => [unique("transaction_tags_pk").on(t.transactionId, t.tagId)],
);

export const recurringTransactions = pgTable(
  "recurring_transactions",
  recurringTransactionsColumns(),
);

/* ------------------------------------------------------------------ *
 * Receipts
 * ------------------------------------------------------------------ */

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    imageKey: text("image_key").notNull(),
    /** Raw model response, kept verbatim so a prompt change allows re-parsing. */
    ocrJson: jsonb("ocr_json"),
    merchant: text("merchant"),
    total: money("total"),
    currency: text("currency").references(() => currencies.code),
    purchasedAt: date("purchased_at"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_transaction_idx").on(t.transactionId)],
);

/**
 * §6.10 — the optional breakdown belongs to the PAYMENT, not to the photograph.
 * A card tap covering fuel and a coffee is one transaction and can be broken
 * down whether or not a receipt was ever captured; a receipt populates these
 * rows rather than owning them.
 */
export const transactionLines = pgTable(
  "transaction_lines",
  transactionLinesColumns({
    transactionId: () => transactions.id,
    receiptId: () => receipts.id,
  }),
  (t) => [
    index("transaction_lines_transaction_idx").on(t.transactionId),
    index("transaction_lines_receipt_idx").on(t.receiptId),
    // M2 — S19's merge preview (`readCategoryReferenceCounts`) scans this by
    // category on every render the merge sheet is open for; `transactions`
    // already had `transactions_category_idx`, this table did not.
    index("transaction_lines_category_idx").on(t.categoryId),
  ],
);

/* ------------------------------------------------------------------ *
 * Statement import
 * ------------------------------------------------------------------ */

export const importBatchStatus = pgEnum("import_batch_status", [
  "open",
  "reviewing",
  "complete",
  "abandoned",
]);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceFile: text("source_file").notNull(),
  parser: text("parser").notNull(),
  accountId: uuid("account_id").references(() => accounts.id),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  status: importBatchStatus("status").notNull().default("open"),
  createdAt: createdAt(),
});

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    /** Verbatim source row — never mutated, so a reparse is always possible. */
    raw: jsonb("raw").notNull(),
    parsed: jsonb("parsed"),
    status: importRowStatus("status").notNull().default("pending"),
    matchedTransactionId: uuid("matched_transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    /** Which model produced it — a threshold is uninterpretable without this once §11.4's config changes. */
    modelId: text("model_id"),
    reason: text("reason"),
    ruleApplied: uuid("rule_applied").references((): AnyPgColumn => rules.id, {
      onDelete: "set null",
    }),
    /**
     * The rule's conditions AS THEY WERE when it fired, and the retrieved
     * neighbour ids the model tier was handed. Editing a rule afterwards
     * changes future classification and cannot rewrite what happened — which is
     * what §9.4's reparse promise actually requires.
     */
    ruleSnapshot: jsonb("rule_snapshot"),
    retrievedIds: jsonb("retrieved_ids"),
    createdAt: createdAt(),
  },
  (t) => [
    index("import_rows_batch_idx").on(t.batchId),
    index("import_rows_status_idx").on(t.status),
  ],
);

/** Deterministic classification, tried before any model call (§9.2). */
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    conditions: jsonb("conditions").notNull(),
    actions: jsonb("actions").notNull(),
    hits: integer("hits").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rules_priority_idx").on(t.priority)],
);

/* ------------------------------------------------------------------ *
 * Tax — the ledger stays jurisdiction-neutral (§13.2)
 * ------------------------------------------------------------------ */

export const taxJurisdictions = pgTable("tax_jurisdictions", {
  code: text("code").primaryKey(), // PL, US, DE
  name: text("name").notNull(),
});

export const taxResidency = pgTable(
  "tax_residency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdiction: text("jurisdiction")
      .notNull()
      .references(() => taxJurisdictions.code),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
  },
  (t) => [
    index("tax_residency_range_idx").on(t.jurisdiction, t.validFrom),
    // Non-overlap is an EXCLUDE constraint (`tax_residency_no_overlap`, migration
    // `0009`) — Drizzle has no builder for one, so it lives in SQL only. Two
    // overlapping rows make jurisdiction resolution ambiguous, and silently so:
    // the query returns two rows and something downstream picks the first. Gaps
    // are permitted and *reported* (`tax_residency_gaps`), because being between
    // residencies is a real state and refusing it would make it unrepresentable.
  ],
);

/**
 * Versioned by effective date, because forms change and a closed period must
 * keep reporting under the rules that applied at the time — Poland's KPiR went
 * from 17 columns to 19 on 2026-01-01.
 */
export const taxSchemes = pgTable(
  "tax_schemes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdiction: text("jurisdiction")
      .notNull()
      .references(() => taxJurisdictions.code),
    code: text("code").notNull(), // PL_RYCZALT, PL_KPIR, US_SCHED_C, DE_EUER
    version: text("version").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [unique("tax_schemes_uq").on(t.code, t.version)],
);

export const taxLines = pgTable(
  "tax_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => taxSchemes.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    /** Text, not integer: "22" for Schedule C, "13" for a KPiR column, "8192" for SKR03. */
    code: text("code").notNull(),
    label: text("label").notNull(),
    kind: taxLineKind("kind").notNull(),
    /** Schedule C meals are 50% deductible. Null means fully counted. */
    deductionRate: numeric("deduction_rate", { precision: 5, scale: 4 }),
  },
  (t) => [
    unique("tax_lines_uq").on(t.schemeId, t.code),
    index("tax_lines_scheme_idx").on(t.schemeId),
  ],
);

/** A category maps to a line in each scheme it participates in. Data, not code. */
export const categoryTaxMap = pgTable(
  "category_tax_map",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => taxSchemes.id, { onDelete: "cascade" }),
    taxLineId: uuid("tax_line_id")
      .notNull()
      .references(() => taxLines.id, { onDelete: "cascade" }),
    note: text("note"),
  },
  (t) => [unique("category_tax_map_pk").on(t.categoryId, t.schemeId)],
);

/** §13.6 — rates change by year AND by activity, so both are keys. */
export const ryczaltRates = pgTable(
  "ryczalt_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activity: text("activity").notNull(),
    rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
  },
  (t) => [
    index("ryczalt_rates_activity_idx").on(t.activity, t.validFrom),
    check("ryczalt_rates_range_sane", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
    check("ryczalt_rates_sane", sql`${t.rate} between 0 and 1`),
  ],
);

/**
 * §13.4 — closing is an explicit act, and the lock is what makes an export
 * rebuild reproducible and stops a later FX correction re-rating a filed
 * period. Append-only: a close/reopen/reclose cycle is three rows, not one row
 * overwritten, because §13.4 says reopening is audited and a mutable column
 * stores a state rather than a history.
 */
export const taxPeriodLocks = pgTable(
  "tax_period_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdiction: text("jurisdiction")
      .notNull()
      .references(() => taxJurisdictions.code),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** A period spanning a scheme change produces one lock per scheme (J11). */
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => taxSchemes.id),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    /** What was known to be incomplete at close — so the lock does not imply clean. */
    acknowledgedWarnings: jsonb("acknowledged_warnings").notNull().default({}),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  },
  (t) => [
    index("tax_period_locks_lookup_idx").on(t.jurisdiction, t.periodStart, t.periodEnd),
    check("tax_period_locks_range_sane", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);

/**
 * §6.6a — a debt moving between people, with no cash flow.
 *
 * The migration found 173 of these: transfers whose source and destination are
 * the same Loan account, netting to zero and therefore invisible to every
 * balance check, with the person named only in free text ("Marek. Total",
 * "Доля Кати после реструктуризации"). Money Manager had no counterparty, so a
 * self-transfer was the only way to say "this 180 is now Marek's, not Tomek's".
 *
 * Not a transaction: a transaction has one counterparty and a cash flow, this
 * has two counterparties and none. Putting it in `transactions` would mean a
 * second counterparty column NULL on every other row, or two rows kept in sync
 * by convention.
 *
 * The invariant is that it must not move net receivables — it takes from one
 * balance exactly what it gives another (`debt_reassignment_effects`).
 */
export const debtReassignments = pgTable(
  "debt_reassignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    fromCounterpartyId: uuid("from_counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    toCounterpartyId: uuid("to_counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    amount: money("amount").notNull(),
    note: text("note").notNull().default(""),
    /** The original text, kept whether or not the names were ever resolved (§9.4). */
    sourceText: text("source_text"),
    externalId: text("external_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("debt_reassignments_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("debt_reassignments_from_idx")
      .on(t.fromCounterpartyId, t.currency)
      .where(sql`${t.deletedAt} is null`),
    index("debt_reassignments_to_idx")
      .on(t.toCounterpartyId, t.currency)
      .where(sql`${t.deletedAt} is null`),
    // Reassigning to oneself is the Money Manager artefact, not a thing to keep.
    check("debt_reassignments_distinct", sql`${t.fromCounterpartyId} <> ${t.toCounterpartyId}`),
    check("debt_reassignments_positive", sql`${t.amount} > 0`),
  ],
);

/**
 * §11.6 — what the agent keeps in mind. Behaviour, never facts: the ledger is
 * queryable and a stored balance would drift from it, which is the defect §6.6
 * removed by deriving. Prepended to every turn, so it is both the most-repeated
 * and, under O17, the most-exposed content in the system.
 */
export const memoryScope = pgEnum("memory_scope", [
  "global",
  "counterparty",
  "account",
  "category",
]);

export const memorySource = pgEnum("memory_source", [
  "told_directly",
  "learned_from_correction",
  "learned_from_usage",
]);

export const agentMemory = pgTable(
  "agent_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: memoryScope("scope").notNull().default("global"),
    subjectId: uuid("subject_id"),
    body: text("body").notNull(),
    source: memorySource("source").notNull(),
    /** Never eviction candidates — an "ask, don't assume" entry is rarely used by design. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_memory_scope_idx").on(t.scope, t.subjectId),
    check("agent_memory_subject_shape", sql`(${t.scope} = 'global') = (${t.subjectId} is null)`),
    /**
     * Behaviour, never facts (§11.6) — a stored figure drifts from the ledger,
     * the same defect §6.6 removed by deriving balances rather than storing them.
     *
     * The predicate refuses a ledger **figure**, not any number. The first
     * version was `[0-9]{2,}`, which also rejected *"split 50/50"* and *"after
     * 22:00"* — behaviour, not facts, and exactly what this feature exists to
     * learn. A guard that blocks the main use case with an unreadable constraint
     * violation is worse than a slightly loose one, especially on the one write
     * that bypasses the approval gate. See migration `0008`.
     */
    check(
      "agent_memory_no_figures",
      // Backslashes are DOUBLED because this is a template literal: JavaScript
      // consumes `\s`, `\$` and `\M` before Postgres ever sees them, so the
      // single-escaped version silently compiled to `s*`, `$` and a literal
      // `M`. That killed the `\M` word-boundary alternative outright — "12.50"
      // stopped being rejected — and it went unnoticed only because nothing
      // had ever generated SQL from this file. The applied migration was
      // correct; this was the weaker twin.
      sql`${t.body} !~ '(?i)([0-9][0-9  ]*([.,][0-9]{2})?\\s*(pln|usd|eur|byn|gel|rub|gbp|zł|zl|\\$|€|₾|₽|£))|((pln|usd|eur|byn|gel|rub|gbp|zł|zl|\\$|€|₾|₽|£)\\s*[0-9])|([0-9]{4,})|([0-9]+[.,][0-9]{2}\\M)'`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Targets — §14.7. Not budgets: no envelopes, no rollover.
 * ------------------------------------------------------------------ */

export const targetPeriod = pgEnum("target_period", ["month", "year"]);

export const targets = pgTable("targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null category = an overall target. */
  categoryId: uuid("category_id").references(() => categories.id),
  period: targetPeriod("period").notNull().default("month"),
  amount: money("amount").notNull(),
  currency: text("currency")
    .notNull()
    .references(() => currencies.code),
  activeFrom: date("active_from").notNull(),
  activeTo: date("active_to"),
});

/* ------------------------------------------------------------------ *
 * Dashboard — widgets are data, so the agent can configure them (§11.0)
 * ------------------------------------------------------------------ */

/**
 * §14.5 — layouts are rows, not constants. Presets ship as seeded `isPreset`
 * rows, so switching between them preserves each layout's per-widget config
 * instead of overwriting one stored grid.
 */
export const dashboardLayouts = pgTable("dashboard_layouts", dashboardLayoutsColumns(), (t) => [
  uniqueIndex("dashboard_layouts_name_uq").on(normalized(t.name)),
  // Exactly one active layout, by the same trick as the pivot currency.
  uniqueIndex("dashboard_layouts_one_active").on(sql`(true)`).where(sql`${t.isActive}`),
]);

export const dashboardWidgets = pgTable("dashboard_widgets", dashboardWidgetsColumns(), (t) => [
  index("dashboard_widgets_layout_idx").on(t.layoutId),
]);

/* ------------------------------------------------------------------ *
 * Agent — one operation registry, two consumers (§11.0)
 * ------------------------------------------------------------------ */

export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  createdAt: createdAt(),
});

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    /** Anthropic content blocks, verbatim. */
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("agent_messages_session_idx").on(t.sessionId)],
);

/**
 * Every operation invocation, with its approval gate. Reads auto-run; writes
 * stay unapplied until approved, so nothing is written on the model's own
 * authority. `auto` marks a write applied under auto mode (§11.2).
 */
export const agentToolCalls = pgTable(
  "agent_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => agentMessages.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    isWrite: boolean("is_write").notNull().default(false),
    auto: boolean("auto").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("agent_tool_calls_message_idx").on(t.messageId)],
);

/**
 * §11.2 — auto mode. `agentToolCalls.auto` records that a write bypassed the
 * gate; this records what was *permitted*, and until when. Without it the
 * scope and duration rules are enforced only by what the running process
 * happens to remember — not a property you want on the one feature that
 * bypasses approval.
 */
export const agentAutoGrants = pgTable(
  "agent_auto_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    /** e.g. 'categorize' — never 'delete', never config or tax scope. */
    operationClass: text("operation_class").notNull(),
    grantedAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxOperations: integer("max_operations"),
    usedOperations: integer("used_operations").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_auto_grants_session_idx").on(t.sessionId),
    // A grant that never ends is not a grant, it is a setting.
    check(
      "agent_auto_grants_bounded",
      sql`${t.expiresAt} is not null or ${t.maxOperations} is not null`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    actor: actor("actor").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Explicit: the createdAt() helper hardcodes "created_at", so `at` would not exist. */
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_at_idx").on(t.at),
  ],
);

/* ------------------------------------------------------------------ *
 * Outbox receipts — C22
 * ------------------------------------------------------------------ */

/**
 * Server-side replay protection for outbox entries (`architecture/08`).
 *
 * The old claim rested on the partial unique index on `external_id`, which
 * fires **only on INSERT** — so every `update_*`, `delete_*`, `categorize_batch`
 * and `merge_counterparties` had no protection at all. Edit a synced row's
 * `is_business` offline, lose the connection before the 200, and the retry
 * carries the `version` its own first application already advanced: the
 * entry is permanently blocked by a conflict with itself, and the interface
 * reports that another device changed it. Nothing did. On `settle_debt`, whose
 * residual is derived from live data, the same replay settles twice.
 *
 * Checked first for every write and written in the same transaction as the
 * effects, so a receipt cannot exist for work that rolled back.
 */
export const outboxReceipts = pgTable("outbox_receipts", {
  /** The client-minted entry id. The idempotency key. */
  entryId: uuid("entry_id").primaryKey(),
  /** Operation name, for reading the ledger without joining anything. */
  op: text("op").notNull(),
  /**
   * Hash of the request payload. A repeat with the same hash returns the
   * stored response; a repeat with a *different* hash is a genuine violation —
   * two different intentions cannot share one id — and is refused.
   */
  requestHash: text("request_hash").notNull(),
  /** Returned verbatim on replay, so a retry is indistinguishable from the first call. */
  response: jsonb("response").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Inferred types
 * ------------------------------------------------------------------ */

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Counterparty = typeof counterparties.$inferSelect;
export type NewCounterparty = typeof counterparties.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Currency = typeof currencies.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
