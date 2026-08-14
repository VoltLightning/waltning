-- Defects found by the adversarial review pass. Each one is a case where the
-- specification claimed a guarantee the database did not provide.

-- 1 ── `transaction_lines`: the breakdown belongs to the payment, not the photo.
--
-- §6.10 was written but never expressed in code, so a hand-entered card payment
-- covering fuel and a coffee could not be broken down at all while the identical
-- purchase WITH a photograph could. It also left migration 0003 referencing a
-- table that did not exist, which meant the three cross-table invariants had
-- never been runnable.
--
-- Drop and recreate rather than rename: no receipt has ever been imported, so
-- there is nothing to preserve, and an empty rename is a needless prompt.
DROP TABLE IF EXISTS "receipt_lines";--> statement-breakpoint

CREATE TABLE "transaction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"receipt_id" uuid,
	"description" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"quantity" numeric(12, 3),
	"category_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint

ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_fk"
	FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_receipt_id_fk"
	FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_category_id_fk"
	FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");--> statement-breakpoint
CREATE INDEX "transaction_lines_transaction_idx" ON "transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_receipt_idx" ON "transaction_lines" USING btree ("receipt_id");--> statement-breakpoint

-- 2 ── Columns the spec referenced that did not exist.
--
-- The createdAt() helper hardcodes "created_at", so `audit_log.at` and
-- `receipts.captured_at` were named one thing in TypeScript and another in
-- Postgres. Every §6.2 query written against audit_log.at would have failed.
ALTER TABLE "audit_log" RENAME COLUMN "created_at" TO "at";--> statement-breakpoint
ALTER TABLE "receipts" RENAME COLUMN "created_at" TO "captured_at";--> statement-breakpoint

-- 3 ── A forgotten FX rate must not silently value a foreign amount at parity.
--
-- With amount_pivot GENERATED (0001), a defaulted 1 turns a bad input into an
-- authoritative-looking output: a 5,000.00 PLN expense valued at 5,000 USD,
-- computed by Postgres with total confidence. §7.4 claimed "Postgres computes it
-- or the write fails; there is no third outcome" — true of the multiplication,
-- false of the input.
ALTER TABLE "transactions" ALTER COLUMN "fx_rate" DROP DEFAULT;--> statement-breakpoint

-- 4 ── Soft-deleted rows must not hold unique slots hostage.
--
-- §6.9 makes soft delete the only delete, and every read path filters
-- deleted_at. So a deleted row blocking a unique index is invisible in the UI
-- and permanent: delete a materialized rent and that occurrence can never be
-- re-posted; delete an imported row and re-running the batch reports a
-- duplicate of something that no longer exists.
DROP INDEX IF EXISTS "transactions_external_id_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_id_uq" ON "transactions" USING btree ("external_id")
	WHERE "transactions"."external_id" is not null and "transactions"."deleted_at" is null;--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_occurrence_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_occurrence_uq" ON "transactions" USING btree ("recurring_id","occurrence_date")
	WHERE "transactions"."recurring_id" is not null and "transactions"."deleted_at" is null;--> statement-breakpoint

-- 5 ── An adjustment must be able to correct downward.
--
-- §7.2 annotates adjustment as "may be negative in effect" and gave it no sign
-- carrier: amount >= 0 for every type, and signed() returns +amount. Reconciling
-- an account DOWN — the ordinary use of an adjustment — was unrepresentable, and
-- the only workaround was an uncategorised expense that then lands in period
-- spending.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_amount_positive";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive"
	CHECK ("transactions"."amount_original" >= 0 or "transactions"."type" = 'adjustment');--> statement-breakpoint

-- 6 ── Cross-scheme tax lines.
--
-- category_tax_map's scheme_id and tax_line_id were independent FKs, so a
-- Polish KPiR mapping could point at a US Schedule C line and print "22" into a
-- real filing. §13.4 rests entirely on a period reporting under the rules that
-- applied at the time; this made the scheme a suggestion.
ALTER TABLE "tax_lines" ADD CONSTRAINT "tax_lines_id_scheme_uq" UNIQUE ("id", "scheme_id");--> statement-breakpoint
ALTER TABLE "category_tax_map" DROP CONSTRAINT IF EXISTS "category_tax_map_tax_line_id_tax_lines_id_fk";--> statement-breakpoint
ALTER TABLE "category_tax_map" ADD CONSTRAINT "category_tax_map_line_in_scheme_fk"
	FOREIGN KEY ("tax_line_id", "scheme_id") REFERENCES "public"."tax_lines"("id", "scheme_id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tax_lines" ADD CONSTRAINT "tax_lines_deduction_rate_sane"
	CHECK ("deduction_rate" IS NULL OR "deduction_rate" BETWEEN 0 AND 1);--> statement-breakpoint

-- 7 ── "Exactly one pivot" was at-most-one.
--
-- A partial unique index bounds a count above, never below. Clearing is_pivot
-- succeeds, and then every rate in fx_rates is quoted against a currency that no
-- longer claims to be the hub while amount_pivot on 8,000 rows is denominated in
-- nothing. Same gap on dashboard_layouts.is_active.
CREATE OR REPLACE FUNCTION assert_exactly_one_pivot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM currencies WHERE is_pivot) <> 1 THEN
    RAISE EXCEPTION 'exactly one currency must be the pivot (SPEC.md §7.0)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER currencies_exactly_one_pivot
  AFTER INSERT OR UPDATE OR DELETE ON currencies
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_exactly_one_pivot();--> statement-breakpoint

-- 8 ── Targets could contradict themselves.
--
-- No unique key, no date sanity, so two overlapping targets for the same
-- category are both legal and §14.7's progress bar has two answers and picks by
-- row order.
ALTER TABLE "targets" ADD CONSTRAINT "targets_range_sane"
	CHECK ("active_to" IS NULL OR "active_to" >= "active_from");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_one_live_per_scope" ON "targets"
	USING btree (COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid), "period")
	WHERE "active_to" IS NULL;--> statement-breakpoint

-- 9 ── Scheme versions could overlap.
ALTER TABLE "tax_schemes" ADD CONSTRAINT "tax_schemes_range_sane"
	CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
