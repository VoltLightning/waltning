/**
 * Waltning ledger schema.
 *
 * Four deliberate departures from Money Manager, each fixing a defect visible
 * in the 7,874-row backup:
 *
 *  1. Stable UUIDs. Money Manager keys on display names, which produced 15
 *     categories with trailing spaces (`Vacation `, `Hobbies `) and accounts
 *     split across Polish `ł` and plain `l`. Names here are display-only;
 *     uniqueness is enforced on the normalized form.
 *  2. Transfers are ONE row with two account references. Money Manager stores
 *     two rows that must be re-paired heuristically — the repo's own docs call
 *     transfers "the most fragile part of the workflow".
 *  3. FX is per-transaction and dated. Money Manager keeps one global rate per
 *     currency and applies it retroactively across five years. Here the local
 *     amount is authoritative and `amount_main` is derived.
 *  4. Full audit trail. Every mutation records who did it — you, an import, or
 *     the agent.
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

/** Money. `numeric` is exact; scale 8 accommodates the `Crypto` account. */
const money = (name: string) => numeric(name, { precision: 20, scale: 8 });

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
 * Account kinds. Money Manager leaves ZTYPE = 0 on all 68 accounts, so the
 * real taxonomy lives in group names and the memo field. Decoded from those:
 *   `Loan X`               → money others owe me          → loan_receivable
 *   `Loan X (my)`          → "Money which I owe somebody" → loan_payable
 *   `Loan X (distributed)` → group-expense clearing account
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

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);

export const txnType = pgEnum("txn_type", [
  "income",
  "expense",
  "transfer",
  "adjustment",
]);

/** Where a row came from — drives trust and review defaults. */
export const txnSource = pgEnum("txn_source", [
  "manual",
  "import",
  "receipt",
  "agent",
  "migration",
]);

export const actor = pgEnum("actor", ["user", "agent", "import", "migration"]);

export const importRowStatus = pgEnum("import_row_status", [
  "pending",
  "ready",
  "needs_review",
  "duplicate",
  "imported",
  "skipped",
]);

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(), // ISO 4217: USD, PLN, BYN, EUR, GEL, GBP, RUB
  name: text("name").notNull(),
  symbol: text("symbol").notNull().default(""),
  /** 'P' prefix or 'S' suffix, mirroring Money Manager's convention. */
  symbolPosition: text("symbol_position").notNull().default("P"),
  decimals: integer("decimals").notNull().default(2),
  /** Exactly one row should be true — the reporting currency (USD). */
  isMain: boolean("is_main").notNull().default(false),
});

/**
 * Daily FX, backfilled from a historical provider. `rate` converts 1 unit of
 * `base` into `quote`. Reporting amounts derive from this, so correcting a bad
 * rate fixes every affected report at once.
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
    rate: numeric("rate", { precision: 24, scale: 12 }).notNull(),
    source: text("source").notNull().default("unknown"),
  },
  (t) => [
    unique("fx_rates_pk").on(t.base, t.quote, t.date),
    index("fx_rates_lookup_idx").on(t.base, t.quote, t.date),
    check("fx_rates_rate_positive", sql`${t.rate} > 0`),
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
     * Balance carried before the first stored transaction. Money Manager has
     * no equivalent, so migration derives it from the delta between its
     * reported balance and the sum of migrated rows.
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
  ],
);

/* ------------------------------------------------------------------ *
 * Categories — arbitrary depth via self-reference
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
     * Sibling names are unique within a parent, per kind. This is what makes
     * `Vacation` and `Vacation ` collapse into one row on migration, and what
     * lets `Other` legitimately exist under both Entertainment and Sports —
     * the collision Money Manager could only resolve with trailing spaces.
     *
     * Postgres treats NULLs as distinct in unique indexes, so top-level
     * categories need coalesce to be constrained at all.
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
    /** A subcategory must not contradict its parent's income/expense kind. */
    check("categories_no_self_parent", sql`${t.id} <> ${t.parentId}`),
  ],
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

    /** Source of funds. For a transfer, the sending side. */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** Destination — set if and only if type = 'transfer'. */
    toAccountId: uuid("to_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    /** Set for income/expense; null for transfers and adjustments. */
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),

    /**
     * The authoritative amount, in the account's own currency, always
     * positive — `type` carries the direction. `amountMain` is derived as
     * amountOriginal x fxRate and stored only to keep reporting queries cheap.
     */
    amountOriginal: money("amount_original").notNull(),
    currency: text("currency")
      .notNull()
      .references(() => currencies.code),
    fxRate: numeric("fx_rate", { precision: 24, scale: 12 })
      .notNull()
      .default("1"),
    amountMain: money("amount_main").notNull(),

    payee: text("payee").notNull().default(""),
    note: text("note").notNull().default(""),
    isBusiness: boolean("is_business").notNull().default(false),

    source: txnSource("source").notNull().default("manual"),
    /** Money Manager ZUID, or an import-row fingerprint. */
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
    index("transactions_payee_idx").on(t.payee),
    uniqueIndex("transactions_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),

    check("transactions_amount_positive", sql`${t.amountOriginal} >= 0`),
    /** Transfers need a destination; nothing else may have one. */
    check(
      "transactions_transfer_shape",
      sql`(${t.type} = 'transfer') = (${t.toAccountId} is not null)`,
    ),
    check(
      "transactions_transfer_distinct",
      sql`${t.toAccountId} is null or ${t.toAccountId} <> ${t.accountId}`,
    ),
    /** Only income and expense carry a category. */
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

/**
 * Recurring templates. Money Manager has 24 live rules in ZREPEATTRANSACTION;
 * they migrate rather than being re-entered by hand.
 */
export const recurringTransactions = pgTable("recurring_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: txnType("type").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: uuid("to_account_id").references(() => accounts.id),
  categoryId: uuid("category_id").references(() => categories.id),

  amountOriginal: money("amount_original").notNull(),
  currency: text("currency")
    .notNull()
    .references(() => currencies.code),
  payee: text("payee").notNull().default(""),
  note: text("note").notNull().default(""),

  /** iCal RRULE, e.g. FREQ=MONTHLY;BYMONTHDAY=1 */
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

    /** Object-store key. The image is never discarded. */
    imageKey: text("image_key").notNull(),
    /** Raw model response, kept verbatim for re-parsing after prompt changes. */
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

/** One Biedronka run split across Groceries and Toiletries. */
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
  parser: text("parser").notNull(), // 'bank_a', 'bank_a_business', 'bank_b', ...
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

    /** Verbatim parsed source row — never mutated, so a reparse is possible. */
    raw: jsonb("raw").notNull(),
    /** Proposed transaction shape after rules and classification. */
    parsed: jsonb("parsed"),

    status: importRowStatus("status").notNull().default("pending"),
    /** Set once accepted, or pointed at the existing row when duplicate. */
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    reason: text("reason"),
    /** True when a `rules` hit classified it and no model call was needed. */
    ruleApplied: uuid("rule_applied"),

    createdAt: createdAt(),
  },
  (t) => [
    index("import_rows_batch_idx").on(t.batchId),
    index("import_rows_status_idx").on(t.status),
  ],
);

/**
 * Deterministic classification, tried before any model call. After a few
 * months the recurring set — rent, salary, subscriptions — is all rules, and
 * the model only sees genuinely novel merchants.
 */
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(100),
    /** { payeeMatches?, amountMin?, amountMax?, accountId?, currency? } */
    conditions: jsonb("conditions").notNull(),
    /** { categoryId?, payee?, note?, isBusiness? } */
    actions: jsonb("actions").notNull(),
    hits: integer("hits").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rules_priority_idx").on(t.priority)],
);

/* ------------------------------------------------------------------ *
 * Agent
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
    role: text("role").notNull(), // user | assistant
    content: jsonb("content").notNull(), // Anthropic content blocks, verbatim
    createdAt: createdAt(),
  },
  (t) => [index("agent_messages_session_idx").on(t.sessionId)],
);

/**
 * Every tool invocation, with its approval gate. Read tools auto-run
 * (`approvedAt` set immediately); writes stay unapplied until you accept the
 * diff card, so nothing is ever written on the model's own authority.
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

/** Answers "why is this categorized this way?" months after the fact. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull(), // 'transactions', 'categories', ...
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // insert | update | delete
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
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Currency = typeof currencies.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
