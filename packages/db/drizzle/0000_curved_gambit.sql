CREATE TYPE "public"."account_kind" AS ENUM('cash', 'bank', 'card', 'loan_receivable', 'loan_payable', 'clearing', 'investment', 'deposit', 'other');--> statement-breakpoint
CREATE TYPE "public"."actor" AS ENUM('user', 'agent', 'import', 'migration');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."counterparty_kind" AS ENUM('person', 'company');--> statement-breakpoint
CREATE TYPE "public"."fx_source" AS ENUM('nbp', 'ecb', 'nbrb', 'nbg', 'manual', 'carried_forward');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('pending', 'ready', 'needs_review', 'duplicate', 'imported', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."ownership" AS ENUM('own', 'shared');--> statement-breakpoint
CREATE TYPE "public"."tax_line_kind" AS ENUM('revenue', 'expense', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."txn_source" AS ENUM('manual', 'import', 'receipt', 'agent', 'migration');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('income', 'expense', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "account_kind" DEFAULT 'other' NOT NULL,
	"currency" text NOT NULL,
	"group_id" uuid,
	"ownership" "ownership" DEFAULT 'own' NOT NULL,
	"opening_balance" numeric(20, 8) DEFAULT '0' NOT NULL,
	"opening_date" date,
	"memo" text DEFAULT '' NOT NULL,
	"is_business" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_shared_not_business" CHECK ("accounts"."ownership" = 'own' or "accounts"."is_business" = false)
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"is_write" boolean DEFAULT false NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor" "actor" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"is_leaf" boolean DEFAULT true NOT NULL,
	"is_earnings" boolean DEFAULT false NOT NULL,
	"icon" text,
	"color" text,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_no_self_parent" CHECK ("categories"."id" <> "categories"."parent_id"),
	CONSTRAINT "categories_earnings_income_only" CHECK ("categories"."kind" = 'income' or "categories"."is_earnings" = false)
);
--> statement-breakpoint
CREATE TABLE "category_mappings" (
	"external_id" text PRIMARY KEY NOT NULL,
	"external_path" text NOT NULL,
	"category_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "category_tax_map" (
	"category_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"tax_line_id" uuid NOT NULL,
	"note" text,
	CONSTRAINT "category_tax_map_pk" UNIQUE("category_id","scheme_id")
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "counterparty_kind" DEFAULT 'person' NOT NULL,
	"settlement_currency" text,
	"contact" text,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text DEFAULT '' NOT NULL,
	"symbol_position" text DEFAULT 'P' NOT NULL,
	"decimals" integer DEFAULT 2 NOT NULL,
	"is_pivot" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"rate_source" "fx_source",
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "currencies_decimals_sane" CHECK ("currencies"."decimals" between 0 and 8)
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"slot" text NOT NULL,
	"size" text DEFAULT 'm' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(24, 12) NOT NULL,
	"source" "fx_source" NOT NULL,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "fx_rates_pk" UNIQUE("base","quote","date"),
	CONSTRAINT "fx_rates_rate_positive" CHECK ("fx_rates"."rate" > 0),
	CONSTRAINT "fx_rates_distinct" CHECK ("fx_rates"."base" <> "fx_rates"."quote")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"parser" text NOT NULL,
	"account_id" uuid,
	"period_start" date,
	"period_end" date,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed" jsonb,
	"status" "import_row_status" DEFAULT 'pending' NOT NULL,
	"matched_transaction_id" uuid,
	"confidence" numeric(4, 3),
	"reason" text,
	"rule_applied" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"quantity" numeric(12, 3),
	"category_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"image_key" text NOT NULL,
	"ocr_json" jsonb,
	"merchant" text,
	"total" numeric(20, 8),
	"currency" text,
	"purchased_at" date,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "txn_type" NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"counterparty_id" uuid,
	"amount_original" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"payee" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"rrule" text NOT NULL,
	"next_date" date,
	"end_date" date,
	"enabled" boolean DEFAULT true NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"period" text DEFAULT 'month' NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"active_from" date NOT NULL,
	"active_to" date
);
--> statement-breakpoint
CREATE TABLE "tax_jurisdictions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"kind" "tax_line_kind" NOT NULL,
	"deduction_rate" numeric(5, 4),
	CONSTRAINT "tax_lines_uq" UNIQUE("scheme_id","code")
);
--> statement-breakpoint
CREATE TABLE "tax_residency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "tax_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"code" text NOT NULL,
	"version" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	CONSTRAINT "tax_schemes_uq" UNIQUE("code","version")
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_tags_pk" UNIQUE("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"type" "txn_type" NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"counterparty_id" uuid,
	"amount_original" numeric(20, 8) NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" numeric(24, 12) DEFAULT '1' NOT NULL,
	"amount_pivot" numeric(20, 8) NOT NULL,
	"to_amount" numeric(20, 8),
	"to_currency" text,
	"to_fx_rate" numeric(24, 12),
	"payee" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_business" boolean DEFAULT false NOT NULL,
	"is_capital" boolean DEFAULT false NOT NULL,
	"source" "txn_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_original" >= 0),
	CONSTRAINT "transactions_transfer_shape" CHECK (("transactions"."type" = 'transfer') = ("transactions"."to_account_id" is not null)),
	CONSTRAINT "transactions_transfer_distinct" CHECK ("transactions"."to_account_id" is null or "transactions"."to_account_id" <> "transactions"."account_id"),
	CONSTRAINT "transactions_to_amount_shape" CHECK (("transactions"."type" = 'transfer') = ("transactions"."to_amount" is not null)),
	CONSTRAINT "transactions_to_amount_positive" CHECK ("transactions"."to_amount" is null or "transactions"."to_amount" >= 0),
	CONSTRAINT "transactions_category_shape" CHECK (("transactions"."type" in ('income', 'expense')) or "transactions"."category_id" is null)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_tax_map" ADD CONSTRAINT "category_tax_map_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_tax_map" ADD CONSTRAINT "category_tax_map_scheme_id_tax_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."tax_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_tax_map" ADD CONSTRAINT "category_tax_map_tax_line_id_tax_lines_id_fk" FOREIGN KEY ("tax_line_id") REFERENCES "public"."tax_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_settlement_currency_currencies_code_fk" FOREIGN KEY ("settlement_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_base_currencies_code_fk" FOREIGN KEY ("base") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_quote_currencies_code_fk" FOREIGN KEY ("quote") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_lines" ADD CONSTRAINT "tax_lines_scheme_id_tax_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."tax_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_residency" ADD CONSTRAINT "tax_residency_jurisdiction_tax_jurisdictions_code_fk" FOREIGN KEY ("jurisdiction") REFERENCES "public"."tax_jurisdictions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_schemes" ADD CONSTRAINT "tax_schemes_jurisdiction_tax_jurisdictions_code_fk" FOREIGN KEY ("jurisdiction") REFERENCES "public"."tax_jurisdictions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_currency_currencies_code_fk" FOREIGN KEY ("to_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_name_uq" ON "account_groups" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_uq" ON "accounts" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_external_id_uq" ON "accounts" USING btree ("external_id") WHERE "accounts"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "accounts_kind_idx" ON "accounts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "accounts_ownership_idx" ON "accounts" USING btree ("ownership");--> statement-breakpoint
CREATE INDEX "agent_messages_session_idx" ON "agent_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_message_idx" ON "agent_tool_calls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_sibling_uq" ON "categories" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),"kind",lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_external_id_uq" ON "categories" USING btree ("external_id") WHERE "categories"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "category_mappings_category_idx" ON "category_mappings" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "counterparties_name_uq" ON "counterparties" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_one_pivot" ON "currencies" USING btree ((true)) WHERE "currencies"."is_pivot";--> statement-breakpoint
CREATE INDEX "fx_rates_lookup_idx" ON "fx_rates" USING btree ("base","quote","date");--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_rows_status_idx" ON "import_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipts_transaction_idx" ON "receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "rules_priority_idx" ON "rules" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_uq" ON "tags" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "tax_lines_scheme_idx" ON "tax_lines" USING btree ("scheme_id");--> statement-breakpoint
CREATE INDEX "tax_residency_range_idx" ON "tax_residency" USING btree ("jurisdiction","valid_from");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_to_account_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "transactions_counterparty_idx" ON "transactions" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "transactions_payee_idx" ON "transactions" USING btree ("payee");--> statement-breakpoint
CREATE INDEX "transactions_capital_idx" ON "transactions" USING btree ("is_capital") WHERE "transactions"."is_capital";--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_id_uq" ON "transactions" USING btree ("external_id") WHERE "transactions"."external_id" is not null;