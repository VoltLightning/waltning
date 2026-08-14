-- The columns and tables `docs/specification/computations.md` requires.
-- Every one closes a figure the interface promised and no query could produce.

-- 1 ── The destination leg needs its own pivot value.
--
-- computations §5: "my spending nets the shared boundary" subtracts transfers
-- IN from shared accounts. Without to_amount_pivot that subtraction silently
-- uses the SOURCE amount, so a cross-currency round trip understates the true
-- cost by the entire spread — 8,00 zl reported against a real 15,00.
ALTER TABLE "transactions" ADD COLUMN "to_amount_pivot" numeric(20, 8)
	GENERATED ALWAYS AS ("to_amount" * "to_fx_rate") STORED;--> statement-breakpoint

-- 2 ── A settlement can discharge a balance in a currency other than the one
--      that changed hands.
--
-- S14 renders a "Discharges" picker across every currency the counterparty
-- holds. The currency trigger forces the row into the ACCOUNT's currency, so
-- without these the picker is unimplementable: handing over 50 EUR against a
-- PLN debt either discharges the wrong balance or cannot store the agreed rate.
ALTER TABLE "transactions" ADD COLUMN "debt_currency" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_amount" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_currency_fk"
	FOREIGN KEY ("debt_currency") REFERENCES "public"."currencies"("code");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_shape"
	CHECK (("debt_currency" IS NULL) = ("debt_amount" IS NULL));--> statement-breakpoint

-- 3 ── A stated bank fee, distinct from the rate margin (§7.5).
--      They are different kinds of cost and only one is avoidable.
ALTER TABLE "transactions" ADD COLUMN "fee" numeric(20, 8);--> statement-breakpoint

-- 4 ── Ryczalt rate AND activity, both stamped.
--
-- §13.6 stamps the rate so a later correction cannot reprice a filed period.
-- Without the activity, two activities sharing 12% today are indistinguishable
-- once the rates diverge, and a retroactive correction has no affected-row
-- query. S28 groups by rate and would merge them.
ALTER TABLE "transactions" ADD COLUMN "ryczalt_rate" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "ryczalt_activity" text;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "default_activity" text;--> statement-breakpoint

-- 5 ── The verification gate's independent right-hand side.
--
-- §8.4: without this the gate evaluates (computed - Σ) + Σ = computed for every
-- account, unconditionally. It cannot fail. This column holds the balance as
-- DISPLAYED by Money Manager, typed by hand — the only figure in existence that
-- our own extractor did not compute.
ALTER TABLE "accounts" ADD COLUMN "expected_balance" numeric(20, 8);--> statement-breakpoint

-- 6 ── §12.2 totals FX cost "by institution" and no entity carried one.
ALTER TABLE "account_groups" ADD COLUMN "institution" text;--> statement-breakpoint

-- 7 ── Classification provenance.
--
-- §9.4 keeps import_rows.raw unmutated so a reparse is always possible — a
-- promise worth nothing if a reparse can answer differently. The rule's
-- conditions as they fired and the retrieved neighbour ids are what make a
-- replay reproducible; model_id is what keeps a confidence threshold
-- interpretable after §11.4's config changes.
ALTER TABLE "import_rows" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "rule_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "retrieved_ids" jsonb;--> statement-breakpoint

-- 8 ── Ryczalt rates: dated, and keyed by activity.
CREATE TABLE "ryczalt_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity" text NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "ryczalt_rates_range_sane" CHECK ("valid_to" is null or "valid_to" >= "valid_from"),
	CONSTRAINT "ryczalt_rates_sane" CHECK ("rate" between 0 and 1)
);--> statement-breakpoint
CREATE INDEX "ryczalt_rates_activity_idx" ON "ryczalt_rates" USING btree ("activity","valid_from");--> statement-breakpoint

-- 9 ── Period locks. Append-only.
--
-- §13.4 says reopening is audited; a mutable reopened_at column stores a state,
-- not a history, so a close-reopen-reclose cycle overwrites the first close.
-- One row per scheme, because J11 calls a period spanning a scheme change
-- normal and a single scheme_id cannot represent it.
CREATE TABLE "tax_period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"scheme_id" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_warnings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reopened_at" timestamp with time zone,
	CONSTRAINT "tax_period_locks_range_sane" CHECK ("period_end" >= "period_start")
);--> statement-breakpoint
ALTER TABLE "tax_period_locks" ADD CONSTRAINT "tax_period_locks_jurisdiction_fk"
	FOREIGN KEY ("jurisdiction") REFERENCES "public"."tax_jurisdictions"("code");--> statement-breakpoint
ALTER TABLE "tax_period_locks" ADD CONSTRAINT "tax_period_locks_scheme_fk"
	FOREIGN KEY ("scheme_id") REFERENCES "public"."tax_schemes"("id");--> statement-breakpoint
CREATE INDEX "tax_period_locks_lookup_idx" ON "tax_period_locks"
	USING btree ("jurisdiction","period_start","period_end");--> statement-breakpoint

-- 10 ── A closed period is frozen. This is the guard §13.4 claimed and no write
--       path had: S09 edits per field with no form-level save, delete has no
--       date check, and nothing prevented backdating a new row into a filed
--       period.
CREATE OR REPLACE FUNCTION assert_period_not_closed()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d date := coalesce(NEW.date, OLD.date);
BEGIN
  IF EXISTS (
    SELECT 1 FROM tax_period_locks l
    WHERE l.reopened_at IS NULL
      AND d BETWEEN l.period_start AND l.period_end
  ) THEN
    RAISE EXCEPTION
      'transaction dated % falls in a closed tax period — reopen it first (SPEC.md §13.4)', d
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER transactions_period_not_closed
  BEFORE INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_period_not_closed();--> statement-breakpoint

-- 11 ── Agent memory (§11.6). Behaviour, never facts.
CREATE TYPE "public"."memory_scope" AS ENUM('global', 'counterparty', 'account', 'category');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('told_directly', 'learned_from_correction', 'learned_from_usage');--> statement-breakpoint

CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "memory_scope" DEFAULT 'global' NOT NULL,
	"subject_id" uuid,
	"body" text NOT NULL,
	"source" "memory_source" NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "agent_memory_subject_shape" CHECK (("scope" = 'global') = ("subject_id" is null))
);--> statement-breakpoint
CREATE INDEX "agent_memory_scope_idx" ON "agent_memory" USING btree ("scope","subject_id");--> statement-breakpoint

-- Memory holds behaviour, never facts (§11.6). The rule was stated four times
-- and enforced zero times, on content prepended to every turn and — under O17 —
-- the most-exposed data in the system. A screen is not enforcement.
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_no_figures"
	CHECK ("body" !~ '[0-9]{2,}([.,][0-9]+)?');--> statement-breakpoint

-- 12 ── Indexes the aggregates actually need. Every existing ledger index
--       ignores deleted_at, so no aggregate can be index-only — ~300 ms cold
--       after any memory-pressure event, which is when you open the dashboard.
CREATE INDEX "transactions_date_live" ON "transactions" USING btree ("date")
	INCLUDE ("type", "account_id", "category_id", "currency", "amount_pivot", "is_capital", "is_business")
	WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_to_account_date" ON "transactions" USING btree ("to_account_id","date")
	INCLUDE ("to_amount", "to_fx_rate", "to_currency")
	WHERE "to_account_id" is not null and "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_debt_idx" ON "transactions" USING btree ("counterparty_id","currency")
	INCLUDE ("type", "amount_original")
	WHERE "counterparty_role" = 'debt' and "deleted_at" is null;--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_capital_idx";
