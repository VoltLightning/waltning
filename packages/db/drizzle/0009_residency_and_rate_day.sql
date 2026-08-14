-- Two tax-correctness gaps the register listed as unimplementable.

-- 1 ── `tax_residency` had no gap or overlap constraint.
--
-- The table is a dated timeline of where you are tax resident, and every tax
-- output resolves its jurisdiction through it. Two overlapping rows make that
-- resolution ambiguous — and the ambiguity is silent, because a query joining
-- the timeline just returns two rows and something downstream picks the first.
-- A period spanning a residency change is the case J11 calls normal.
--
-- An EXCLUDE constraint says this in the only place it cannot be forgotten.
-- daterange with '[)' bounds treats an end date as exclusive, so
-- 2024-01-01..2025-01-01 and 2025-01-01..∞ abut without overlapping.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "tax_residency" ADD COLUMN IF NOT EXISTS "valid_to" date;--> statement-breakpoint

ALTER TABLE "tax_residency" ADD CONSTRAINT "tax_residency_no_overlap"
  EXCLUDE USING gist (
    daterange("valid_from", "valid_to", '[)') WITH &&
  );--> statement-breakpoint

-- A gap is not refused — you can be between residencies, and refusing it would
-- make the honest state unrepresentable. It is *reported*, because a transaction
-- dated inside a gap has no jurisdiction and every tax figure for that period is
-- silently incomplete. §15.1 runs this.
CREATE OR REPLACE VIEW tax_residency_gaps AS
  WITH ordered AS (
    SELECT jurisdiction, valid_from, valid_to,
           lead(valid_from) OVER (ORDER BY valid_from) AS next_from
    FROM   tax_residency
  )
  SELECT jurisdiction, valid_to AS gap_start, next_from AS gap_end
  FROM   ordered
  WHERE  valid_to IS NOT NULL
    AND  next_from IS NOT NULL
    AND  next_from > valid_to;--> statement-breakpoint

CREATE OR REPLACE FUNCTION verify_residency_covers(d date)
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM tax_residency
  WHERE d >= valid_from AND (valid_to IS NULL OR d < valid_to);
  RETURN QUERY SELECT
    'residency_defined_for_date',
    n = 1,
    format('%s residency rows cover %s (want exactly 1)', n, d);
END $$;--> statement-breakpoint

-- 2 ── Which day's rate values a foreign-currency revenue row for a PL filing.
--
-- This was unspecified, and the spec's own general FX path is the wrong answer
-- for tax: §7 triangulates through the USD pivot, which produces a cross-rate
-- NBP never published. A tax authority uses the rate NBP actually printed.
--
-- Polish rule: convert at the average NBP rate from the **last working day
-- preceding** the day the revenue arose — not the day itself, and not a rate
-- derived through another currency.
--
-- Stamped per row rather than joined, so a later rate correction cannot reprice
-- a filed period — the same reason §13.6 stamps ryczalt_rate.
ALTER TABLE "transactions" ADD COLUMN "tax_fx_rate" numeric(24, 12);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tax_fx_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tax_fx_source" text;--> statement-breakpoint

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tax_fx_shape"
  CHECK (("tax_fx_rate" IS NULL) = ("tax_fx_date" IS NULL));--> statement-breakpoint

-- The tax view exposes them, so an adapter reads the stamped rate and never
-- recomputes one. Recreated rather than altered because a view's column list is
-- fixed at creation.
CREATE OR REPLACE VIEW tax_ledger AS
  SELECT t.id, t.date, t.type, t.account_id, t.category_id,
         t.counterparty_id, t.counterparty_tax_id, t.document_ref, t.ksef_id,
         t.ryczalt_rate, t.ryczalt_activity,
         t.amount_original, t.currency, t.fx_rate, t.fx_rate_estimated,
         t.amount_pivot, t.payee, t.note,
         t.tax_fx_rate, t.tax_fx_date, t.tax_fx_source
  FROM   transactions t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own';--> statement-breakpoint

-- A business row in a foreign currency with no stamped tax rate cannot be
-- filed. Reported, not refused: refusing the write would block capture at the
-- moment of entry, and the rate for "the working day before" may not be
-- published yet when you record the invoice.
CREATE OR REPLACE VIEW tax_unvalued_revenue AS
  SELECT t.id, t.date, t.payee, t.amount_original, t.currency
  FROM   transactions t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own'
    AND  t.currency <> 'PLN'
    AND  t.tax_fx_rate IS NULL;
