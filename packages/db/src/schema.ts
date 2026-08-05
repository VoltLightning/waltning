/**
 * Waltning ledger schema.
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
    unique("fx_rates_pk").on(t.base, t.quote, t.date),
    index("fx_rates_lookup_idx").on(t.base, t.quote, t.date),
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

    /** Authoritative: the account's own currency, always positive. */
    amountOriginal: money("amount_original").notNull(),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    /** To the pivot, on this row's own date. */
    fxRate: rate("fx_rate").notNull().default("1"),
    /** Derived — amountOriginal × fxRate. Materialized for aggregation only. */
    amountPivot: money("amount_pivot").notNull(),

    /**
     * Cross-currency transfers store BOTH amounts (§7.5). What actually landed
     * is a fact; deriving it from a reference rate would invent a number and
     * silently erase the bank's spread.
     */
    toAmount: money("to_amount"),
    toCurrency: text("to_currency").references(() => currencies.code),
    toFxRate: rate("to_fx_rate"),

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
    uniqueIndex("transactions_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),

    check("transactions_amount_positive", sql`${t.amountOriginal} >= 0`),
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
    check(
      "transactions_category_shape",
      sql`(${t.type} in ('income', 'expense')) or ${t.categoryId} is null`,
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
    capturedAt: createdAt(),
  },
  (t) => [index("receipts_transaction_idx").on(t.transactionId)],
);

export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }),
    categoryId: uuid("category_id").references(() => categories.id),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("receipt_lines_receipt_idx").on(t.receiptId)],
);

/* ------------------------------------------------------------------ *
 * Statement import
 * ------------------------------------------------------------------ */

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceFile: text("source_file").notNull(),
  parser: text("parser").notNull(),
  accountId: uuid("account_id").references(() => accounts.id),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  status: text("status").notNull().default("open"),
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
    reason: text("reason"),
    ruleApplied: uuid("rule_applied"),
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

/* ------------------------------------------------------------------ *
 * Targets — §14.7. Not budgets: no envelopes, no rollover.
 * ------------------------------------------------------------------ */

export const targets = pgTable("targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null category = an overall target. */
  categoryId: uuid("category_id").references(() => categories.id),
  period: text("period").notNull().default("month"), // month | year
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

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  slot: text("slot").notNull(),
  size: text("size").notNull().default("m"),
  config: jsonb("config").notNull().default({}),
  sort: integer("sort").notNull().default(0),
});

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
    at: createdAt(),
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
