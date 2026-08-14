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

import { sql, type SQL } from "drizzle-orm";
import {
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Money. `numeric` is exact; scale 8 accommodates crypto balances. */
const money = (name: string) => numeric(name, { precision: 20, scale: 8 });
const rate = (name: string) => numeric(name, { precision: 24, scale: 12 });

/** Normalized name for uniqueness: case- and whitespace-insensitive. */
const normalized = (col: AnyPgColumn): SQL => sql`lower(btrim(${col}))`;

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/**
 * Money Manager leaves ZTYPE = 0 on all 68 accounts, so the real taxonomy lived
 * in group names and memo text. Decoded from those.
 */
export const accountKind = pgEnum("account_kind", [
  "cash",
  "bank",
  "card",
  "loan_receivable",
  "loan_payable",
  "clearing",
  "investment",
  "deposit",
  "other",
]);

/** §6.7 — a shared account is ordinary; it just belongs to a different total. */
export const ownership = pgEnum("ownership", ["own", "shared"]);

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);

export const txnType = pgEnum("txn_type", [
  "income",
  "expense",
  "transfer",
  "adjustment",
]);

export const txnSource = pgEnum("txn_source", [
  "manual",
  "import",
  "receipt",
  "agent",
  "migration",
]);

export const actor = pgEnum("actor", ["user", "agent", "import", "migration"]);

export const counterpartyKind = pgEnum("counterparty_kind", [
  "person",
  "company",
]);

/**
 * §6.6 — naming a counterparty is not the same as owing them. Only `debt` rows
 * reach `counterparty_balances`; `contribution` attributes an inflow to a
 * shared account (§6.7) and carries no settlement expectation; `reference`
 * merely records who was involved.
 */
export const counterpartyRole = pgEnum("counterparty_role", [
  "debt",
  "contribution",
  "reference",
]);

/** §7.6 — `manual` outranks every synced source for the same pair and date. */
export const fxSource = pgEnum("fx_source", [
  "nbp",
  "ecb",
  "nbrb",
  "nbg",
  "manual",
  "carried_forward",
]);

export const importRowStatus = pgEnum("import_row_status", [
  "pending",
  "ready",
  "needs_review",
  "duplicate",
  "imported",
  "skipped",
]);

export const taxLineKind = pgEnum("tax_line_kind", [
  "revenue",
  "expense",
  "excluded",
]);

/* ------------------------------------------------------------------ *
 * Currencies and FX
 * ------------------------------------------------------------------ */

export const currencies = pgTable(
  "currencies",
  {
    code: text("code").primaryKey(), // ISO 4217
    name: text("name").notNull(),
    symbol: text("symbol").notNull().default(""),
    /** 'P' prefix or 'S' suffix. */
    symbolPosition: text("symbol_position").notNull().default("P"),
    decimals: integer("decimals").notNull().default(2),

    /**
     * The technical hub every stored rate is quoted against (§7.0). Chosen once
     * as USD and never surfaced in the interface. NOT a reporting currency —
     * there isn't one; display currency is a client preference.
     */
    isPivot: boolean("is_pivot").notNull().default(false),
    /** Shown in the header display-currency toggle. */
    pinned: boolean("pinned").notNull().default(false),

    rateSource: fxSource("rate_source"),
    archived: boolean("archived").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    // Exactly one pivot. There is deliberately no equivalent constraint on a
    // reporting currency, because none exists.
    uniqueIndex("currencies_one_pivot")
      .on(sql`(true)`)
      .where(sql`${t.isPivot}`),
    check("currencies_decimals_sane", sql`${t.decimals} between 0 and 8`),
  ],
);

/**
 * Daily reference rates, all quoted against the pivot — verified available from
 * 2020-11-25 for every currency in use (§7.7). Any other pair derives by
 * triangulation, which is what makes an arbitrary display currency free.
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    base: text("base")
      .notNull()
      .references(() => currencies.code),
    quote: text("quote")
      .notNull()
      .references(() => currencies.code),
    date: date("date").notNull(),
    rate: rate("rate").notNull(),
    source: fxSource("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  },
  (t) => [
    // A real primary key: (base, quote, date) *is* the identity of a rate. The
    // unique constraint already builds the btree that lookups use, so a
    // separate index on the same columns would be pure duplication.
    primaryKey({
      name: "fx_rates_pk",
      columns: [t.base, t.quote, t.date],
    }),
    check("fx_rates_rate_positive", sql`${t.rate} > 0`),
    check("fx_rates_distinct", sql`${t.base} <> ${t.quote}`),
  ],
);

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export const accountGroups = pgTable(
  "account_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** §12.2 totals FX cost by institution, and no entity carried one. */
    institution: text("institution"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("account_groups_name_uq").on(normalized(t.name))],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: accountKind("kind").notNull().default("other"),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    groupId: uuid("group_id").references(() => accountGroups.id),

    /**
     * §6.7. `shared` accounts are fully real — balance, transactions, and they
     * may go negative. They belong to the *ours* total rather than *mine*, and
     * income into one is a contribution rather than earnings.
     */
    ownership: ownership("ownership").notNull().default("own"),

    /**
     * Balance before the first stored transaction. Derived during migration
     * from the difference between the reported balance and the imported rows,
     * which is what makes a balances-only migration accurate (§8.0).
     */
    openingBalance: money("opening_balance").notNull().default("0"),
    openingDate: date("opening_date"),
    /**
     * §8.4 — the balance as displayed by Money Manager, typed in by hand. The
     * ONLY figure in existence not computed by our own extractor, and therefore
     * the only genuinely external oracle the verification gate has. Without it
     * the gate is an algebraic identity that cannot fail.
     */
    expectedBalance: money("expected_balance"),

    memo: text("memo").notNull().default(""),
    isBusiness: boolean("is_business").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    sort: integer("sort").notNull().default(0),

    /** Money Manager ZUID — makes re-migration idempotent. */
    externalId: text("external_id"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_name_uq").on(normalized(t.name)),
    uniqueIndex("accounts_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("accounts_kind_idx").on(t.kind),
    index("accounts_ownership_idx").on(t.ownership),
    // Shared money is never reportable (§13).
    check(
      "accounts_shared_not_business",
      sql`${t.ownership} = 'own' or ${t.isBusiness} = false`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Categories — groups and leaves, never both
 * ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),

    /**
     * TAXONOMY.md R1: a category is a group OR a leaf, never both. Only leaves
     * are assignable. Money Manager allowed both — `Food` had 705 transactions
     * *and* children — which is the root cause of its 13 name collisions and
     * 15 trailing-space workarounds.
     */
    isLeaf: boolean("is_leaf").notNull().default(true),

    /**
     * §6.7 — income only. Salary, bonus, business revenue and investment
     * returns are earnings; gifts, refunds and repayments raise a balance
     * without being income. One flag covers a co-owner's money, a birthday
     * present, and a refund alike.
     */
    isEarnings: boolean("is_earnings").notNull().default(false),

    icon: text("icon"),
    color: text("color"),
    archived: boolean("archived").notNull().default(false),
    sort: integer("sort").notNull().default(0),

    externalId: text("external_id"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
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
    uniqueIndex("categories_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("categories_parent_idx").on(t.parentId),
    check("categories_no_self_parent", sql`${t.id} <> ${t.parentId}`),
    // Earnings is an income-side concept only.
    check(
      "categories_earnings_income_only",
      sql`${t.kind} = 'income' or ${t.isEarnings} = false`,
    ),
  ],
);

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

export const counterparties = pgTable(
  "counterparties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: counterpartyKind("kind").notNull().default("person"),
    /** The currency they prefer to settle in — not a system-wide concept. */
    settlementCurrency: text("settlement_currency").references(
      () => currencies.code,
    ),
    contact: text("contact"),
    note: text("note").notNull().default(""),
    /** §13.6 — resolves the ryczalt rate for revenue rows from this party. */
    defaultActivity: text("default_activity"),
    archived: boolean("archived").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("counterparties_name_uq").on(normalized(t.name))],
);

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    type: txnType("type").notNull(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** Set if and only if type = 'transfer'. */
    toAccountId: uuid("to_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    /**
     * Debt (§6.6), or attribution of a contribution to a shared account (§6.7).
     * The latter carries no settlement expectation and is never aged.
     */
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id),
    /**
     * What the reference *means*. Set at write time, never inferred: deriving
     * it from `accounts.ownership` works today but silently rewrites the
     * meaning of history the moment an account is reclassified.
     */
    counterpartyRole: counterpartyRole("counterparty_role"),
    /**
     * Which balance a settlement discharges, when that differs from the
     * currency that changed hands (§6.6). Without these, S14's picker is
     * unimplementable: the currency trigger forces the row into the account's
     * currency, which discharges the wrong balance.
     */
    debtCurrency: text("debt_currency").references(() => currencies.code),
    debtAmount: money("debt_amount"),

    /** Authoritative: the account's own currency, always positive. */
    amountOriginal: money("amount_original").notNull(),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    /**
     * To the pivot, on this row's own date. **No default**: a forgotten rate
     * must be a NOT NULL violation, not a silent 1:1 valuation. With
     * amountPivot generated, a defaulted 1 would turn a bad input into an
     * authoritative-looking output.
     */
    fxRate: rate("fx_rate").notNull(),
    /**
     * §7.6 — no rate was published for this date and the nearest was used. The
     * rate *table* stays capped at 10 days of carry, so it never holds an
     * invented figure; the estimate lives here, attributable to one row.
     */
    fxRateEstimated: boolean("fx_rate_estimated").notNull().default(false),
    /**
     * Generated, not written. This is the column every aggregate reads, so
     * leaving it to application code would make the most-read number in the
     * system the one most able to drift from its inputs.
     */
    amountPivot: money("amount_pivot").generatedAlwaysAs(
      (): SQL => sql`${transactions.amountOriginal} * ${transactions.fxRate}`,
    ),

    /**
     * Cross-currency transfers store BOTH amounts (§7.5). What actually landed
     * is a fact; deriving it from a reference rate would invent a number and
     * silently erase the bank's spread.
     */
    toAmount: money("to_amount"),
    toCurrency: text("to_currency").references(() => currencies.code),
    /**
     * The **reference** rate for `to_currency` on this row's date, pivot per
     * unit. NOT the realized rate: storing that makes the two legs net to
     * exactly zero and erases the bank's margin, which §7.0 says cannot happen.
     * The realized rate is derived for display as to_amount / amount_original.
     */
    toFxRate: rate("to_fx_rate"),
    /** Generated. The destination leg needs its own pivot value (computations §5). */
    toAmountPivot: money("to_amount_pivot").generatedAlwaysAs(
      (): SQL => sql`${transactions.toAmount} * ${transactions.toFxRate}`,
    ),

    payee: text("payee").notNull().default(""),
    note: text("note").notNull().default(""),
    isBusiness: boolean("is_business").notNull().default(false),

    /**
     * §6.8 — a one-off capital event. Excluded from trends, targets and period
     * comparisons by default, with the exclusion stated. A single property
     * purchase is 96% of its category and ~7× a normal year; left unflagged it
     * makes every comparison meaningless permanently.
     */
    isCapital: boolean("is_capital").notNull().default(false),

    /**
     * §14.4 — which recurring rule produced this row, and which occurrence it
     * satisfies. The unique index below is what makes double-posting
     * impossible rather than something a scheduler has to remember.
     */
    recurringId: uuid("recurring_id").references(
      (): AnyPgColumn => recurringTransactions.id,
    ),
    occurrenceDate: date("occurrence_date"),

    /** A stated bank fee, distinct from the rate margin (§7.5). */
    fee: money("fee"),

    /** §13.2 — business rows only; optional from day one so opting into VAT later is not a migration. */
    counterpartyTaxId: text("counterparty_tax_id"),
    documentRef: text("document_ref"),
    ksefId: text("ksef_id"),
    /**
     * §13.6 — resolved from `ryczalt_rates` at the row's own date and STAMPED,
     * so a later rate correction cannot reprice a filed period. The activity is
     * stamped too: without it, two activities sharing 12% today are
     * indistinguishable if the rates later diverge, and a retroactive
     * correction has no affected-row query.
     */
    ryczaltRate: numeric("ryczalt_rate", { precision: 5, scale: 4 }),
    ryczaltActivity: text("ryczalt_activity"),

    source: txnSource("source").notNull().default("manual"),
    externalId: text("external_id"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
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
    check(
      "transactions_amount_positive",
      sql`${t.amountOriginal} >= 0 or ${t.type} = 'adjustment'`,
    ),
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
    check(
      "transactions_to_amount_positive",
      sql`${t.toAmount} is null or ${t.toAmount} >= 0`,
    ),
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
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tags_name_uq").on(normalized(t.name))],
);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [unique("transaction_tags_pk").on(t.transactionId, t.tagId)],
);

export const recurringTransactions = pgTable("recurring_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: txnType("type").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: uuid("to_account_id").references(() => accounts.id),
  categoryId: uuid("category_id").references(() => categories.id),
  counterpartyId: uuid("counterparty_id").references(() => counterparties.id),

  amountOriginal: money("amount_original").notNull(),
  currency: text("currency")
    .notNull()
    .references(() => currencies.code),
  payee: text("payee").notNull().default(""),
  note: text("note").notNull().default(""),

  /** iCal RRULE. Projections appear in the calendar as scheduled (§14.4). */
  rrule: text("rrule").notNull(),
  nextDate: date("next_date"),
  endDate: date("end_date"),
  enabled: boolean("enabled").notNull().default(true),

  externalId: text("external_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    /** Set when a receipt extraction produced this line. Null when hand-entered. */
    receiptId: uuid("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }),
    categoryId: uuid("category_id").references(() => categories.id),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("transaction_lines_transaction_idx").on(t.transactionId),
    index("transaction_lines_receipt_idx").on(t.receiptId),
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
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
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
  (t) => [index("tax_residency_range_idx").on(t.jurisdiction, t.validFrom)],
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
export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    isPreset: boolean("is_preset").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    uniqueIndex("dashboard_layouts_name_uq").on(normalized(t.name)),
    // Exactly one active layout, by the same trick as the pivot currency.
    uniqueIndex("dashboard_layouts_one_active")
      .on(sql`(true)`)
      .where(sql`${t.isActive}`),
  ],
);

export const widgetSize = pgEnum("widget_size", ["s", "m", "l"]);

export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => dashboardLayouts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    slot: text("slot").notNull(),
    size: widgetSize("size").notNull().default("m"),
    config: jsonb("config").notNull().default({}),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("dashboard_widgets_layout_idx").on(t.layoutId)],
);

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
