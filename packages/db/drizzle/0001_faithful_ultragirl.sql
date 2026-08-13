CREATE TYPE "public"."counterparty_role" AS ENUM('debt', 'contribution', 'reference');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('open', 'reviewing', 'complete', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."target_period" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."widget_size" AS ENUM('s', 'm', 'l');--> statement-breakpoint
CREATE TABLE "agent_auto_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"operation_class" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"max_operations" integer,
	"used_operations" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agent_auto_grants_bounded" CHECK ("agent_auto_grants"."expires_at" is not null or "agent_auto_grants"."max_operations" is not null)
);
--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_preset" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fx_rates" DROP CONSTRAINT "fx_rates_pk";--> statement-breakpoint
DROP INDEX "fx_rates_lookup_idx";--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ALTER COLUMN "size" SET DEFAULT 'm'::"public"."widget_size";--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ALTER COLUMN "size" SET DATA TYPE "public"."widget_size" USING "size"::"public"."widget_size";--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."import_batch_status";--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "status" SET DATA TYPE "public"."import_batch_status" USING "status"::"public"."import_batch_status";--> statement-breakpoint
ALTER TABLE "targets" ALTER COLUMN "period" SET DEFAULT 'month'::"public"."target_period";--> statement-breakpoint
ALTER TABLE "targets" ALTER COLUMN "period" SET DATA TYPE "public"."target_period" USING "period"::"public"."target_period";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount_pivot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" drop column "amount_pivot";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "amount_pivot" numeric(20, 8) GENERATED ALWAYS AS ("transactions"."amount_original" * "transactions"."fx_rate") STORED;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_pk" PRIMARY KEY("base","quote","date");--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD COLUMN "layout_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty_role" "counterparty_role";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "fx_rate_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty_tax_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "document_ref" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "ksef_id" text;--> statement-breakpoint
ALTER TABLE "agent_auto_grants" ADD CONSTRAINT "agent_auto_grants_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_auto_grants_session_idx" ON "agent_auto_grants" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_name_uq" ON "dashboard_layouts" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_one_active" ON "dashboard_layouts" USING btree ((true)) WHERE "dashboard_layouts"."is_active";--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_layout_id_dashboard_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."dashboard_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_rule_applied_rules_id_fk" FOREIGN KEY ("rule_applied") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_id_recurring_transactions_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_widgets_layout_idx" ON "dashboard_widgets" USING btree ("layout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_occurrence_uq" ON "transactions" USING btree ("recurring_id","occurrence_date") WHERE "transactions"."recurring_id" is not null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_currency_shape" CHECK (("transactions"."type" = 'transfer') = ("transactions"."to_currency" is not null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_fx_rate_shape" CHECK (("transactions"."type" = 'transfer') = ("transactions"."to_fx_rate" is not null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_role_shape" CHECK (("transactions"."counterparty_id" is not null) = ("transactions"."counterparty_role" is not null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_occurrence_shape" CHECK (("transactions"."recurring_id" is null) = ("transactions"."occurrence_date" is null));