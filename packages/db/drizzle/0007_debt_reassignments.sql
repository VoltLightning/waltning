-- Debt reassignment (§6.6a) — the transfer that moves nothing.
--
-- 173 rows in the Money Manager export are transfers whose source and
-- destination are the same account. They net to zero, which is why no balance
-- check ever saw them, and every one sits on a Loan account: "Marek. Total",
-- "Piotr. Total", "Доля Кати после реструктуризации". They are debts moving
-- between people, recorded as a self-transfer because Money Manager has no
-- counterparty field.
--
-- They cannot be transactions. A transaction has one counterparty and a cash
-- flow; this has two counterparties and no cash flow. Forcing it into
-- `transactions` would mean either a second counterparty column that is NULL on
-- every other row, or two rows that must be kept in sync by convention.
CREATE TABLE "debt_reassignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"from_counterparty_id" uuid NOT NULL,
	"to_counterparty_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	-- The original free text, kept whether or not the names were ever resolved.
	-- §9.4's rule: the source stays unmutated so a rereading is always possible.
	"source_text" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	-- A reassignment between one person and themselves is the Money Manager
	-- artefact we are migrating away from, not a thing to preserve.
	CONSTRAINT "debt_reassignments_distinct" CHECK ("from_counterparty_id" <> "to_counterparty_id"),
	CONSTRAINT "debt_reassignments_positive" CHECK ("amount" > 0)
);--> statement-breakpoint

ALTER TABLE "debt_reassignments" ADD CONSTRAINT "debt_reassignments_from_fk"
	FOREIGN KEY ("from_counterparty_id") REFERENCES "public"."counterparties"("id");--> statement-breakpoint
ALTER TABLE "debt_reassignments" ADD CONSTRAINT "debt_reassignments_to_fk"
	FOREIGN KEY ("to_counterparty_id") REFERENCES "public"."counterparties"("id");--> statement-breakpoint
ALTER TABLE "debt_reassignments" ADD CONSTRAINT "debt_reassignments_currency_fk"
	FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code");--> statement-breakpoint

CREATE UNIQUE INDEX "debt_reassignments_external_id_uq" ON "debt_reassignments"
	USING btree ("external_id") WHERE "external_id" is not null;--> statement-breakpoint
CREATE INDEX "debt_reassignments_from_idx" ON "debt_reassignments"
	USING btree ("from_counterparty_id","currency") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "debt_reassignments_to_idx" ON "debt_reassignments"
	USING btree ("to_counterparty_id","currency") WHERE "deleted_at" is null;--> statement-breakpoint

-- The invariant that makes this checkable: a reassignment moves a balance
-- between two people and must not change what is owed in total. Stated as a
-- view rather than prose, so §15.1 can evaluate it on a schedule.
--
-- Per currency, the sum of every reassignment's effect is +amount on one
-- counterparty and −amount on the other. It sums to zero by construction — so
-- unlike the §8.4 gate, this one is checked against the OTHER derivation:
-- the counterparty balances that actually include these rows.
CREATE OR REPLACE VIEW debt_reassignment_effects AS
  SELECT to_counterparty_id AS counterparty_id, currency,  amount AS delta, id, date
  FROM   debt_reassignments WHERE deleted_at IS NULL
  UNION ALL
  SELECT from_counterparty_id,                  currency, -amount,          id, date
  FROM   debt_reassignments WHERE deleted_at IS NULL;
