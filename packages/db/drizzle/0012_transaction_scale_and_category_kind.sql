-- Hand-written, matching `0001_database_objects.sql`'s own precedent: two
-- cross-table invariants a CHECK cannot state, because each needs a second
-- table's row (`currencies.decimals`, `categories.kind`). `wave-4-shared.md`'s
-- coordination note applies — another PR this wave adds its own migration off
-- the same base; the orchestrator renumbers whichever one lands second. This
-- one landed at 0012.
--
-- SQLSTATE catalogue, continued from `0004_row_touch_and_line_sum.sql`:
--
--   WA016  amount holds more decimals than its currency  → validation
--   WA017  category kind disagrees with the transaction   → validation
--
-- ═══ H2 — a figure past its own currency's scale ══════════════════════════
--
-- `amount_original`, `to_amount` and `debt_amount` are each `numeric(20,8)`
-- regardless of currency, so nothing stopped a PLN transaction (two decimal
-- places, `currencies.decimals`) from storing `48.905` in any of the three.
-- The client already refuses this (`create-phone-ledger.ts`'s own
-- `transactions.tooManyDecimals`), but a client-side refusal is not a
-- guarantee — `CLAUDE.md`: "New guarantee → new constraint" — and a row
-- reaching Postgres by any other path (a future import, a script, a bug in
-- that refusal) would sit past the precision its own currency claims to
-- hold.
--
-- **Three pairs, one function — plus `fee`, which pairs with the row's own
-- `currency` rather than a column of its own.** `to_amount`/`to_currency`
-- (the transfer destination leg, §7.5) and `debt_amount`/`debt_currency`
-- (S14's settlement coalesce) are each optional — set together or not at all
-- (`transactions_to_amount_shape` et al. already enforce that shape) — so
-- each pair is checked only when both halves are present. `fee` (S31 §9.1,
-- the bank's stated fee) never carries a currency of its own — it is always
-- in the row's own `currency` — so it is checked whenever it is present,
-- against `NEW.currency` rather than a sibling column.
--
-- **`trim_scale`, not `scale`.** Every one of these columns' type already
-- fixes its *declared* scale at 8, so `scale(amount)` reads 8 on every row
-- regardless of how many of those digits are genuinely significant —
-- "48.90" cast into `numeric(20,8)` stores as "48.90000000" and a bare
-- `scale()` cannot tell it apart from "48.90512340". `trim_scale` removes the
-- trailing zeros first, so `scale(trim_scale(v))` answers the question this
-- guarantee is actually about: how many decimal places did the figure itself
-- carry.
CREATE OR REPLACE FUNCTION assert_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  -- The FK to `currencies` already refuses an unknown code; a missing row
  -- from any of these three lookups means that check has not run yet in this
  -- same statement, not that the guarantee can be skipped.
  IF NEW.amount_original IS NOT NULL AND NEW.currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount_original)) > allowed THEN
      RAISE EXCEPTION
        'amount % holds more decimal places than % (% allows %) (H2)',
        NEW.amount_original, NEW.currency, NEW.currency, allowed
        USING ERRCODE = 'WA016';
    END IF;
  END IF;

  IF NEW.to_amount IS NOT NULL AND NEW.to_currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.to_currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.to_amount)) > allowed THEN
      RAISE EXCEPTION
        'amount % holds more decimal places than % (% allows %) (H2)',
        NEW.to_amount, NEW.to_currency, NEW.to_currency, allowed
        USING ERRCODE = 'WA016';
    END IF;
  END IF;

  IF NEW.debt_amount IS NOT NULL AND NEW.debt_currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.debt_currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.debt_amount)) > allowed THEN
      RAISE EXCEPTION
        'amount % holds more decimal places than % (% allows %) (H2)',
        NEW.debt_amount, NEW.debt_currency, NEW.debt_currency, allowed
        USING ERRCODE = 'WA016';
    END IF;
  END IF;

  -- M — `fee` (S31 §9.1) is a fourth figure `numeric(20,8)` regardless of
  -- currency, and it carries no currency column of its own — it is always
  -- the row's own `currency`, so that is what its scale is checked against.
  IF NEW.fee IS NOT NULL AND NEW.currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.fee)) > allowed THEN
      RAISE EXCEPTION
        'amount % holds more decimal places than % (% allows %) (H2)',
        NEW.fee, NEW.currency, NEW.currency, allowed
        USING ERRCODE = 'WA016';
    END IF;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF
    amount_original, currency, to_amount, to_currency, debt_amount, debt_currency, fee
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_amount_scale();
--> statement-breakpoint

-- ═══ M — `debt_reassignments.amount`, the same guarantee ══════════════════
--
-- `debt_reassignments` (§6.6a) carries its own `currency`/`amount` pair,
-- outside `transactions` entirely, so `assert_amount_scale` above never sees
-- it. Same defect, same fix: a PLN reassignment could store `48.905` past
-- PLN's own two decimal places with nothing to refuse it.
CREATE OR REPLACE FUNCTION assert_debt_reassignment_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount)) > allowed THEN
      RAISE EXCEPTION
        'amount % holds more decimal places than % (% allows %) (H2)',
        NEW.amount, NEW.currency, NEW.currency, allowed
        USING ERRCODE = 'WA016';
    END IF;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER debt_reassignments_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount, currency
  ON debt_reassignments
  FOR EACH ROW EXECUTE FUNCTION assert_debt_reassignment_amount_scale();
--> statement-breakpoint

-- ═══ H1-b — a category whose kind disagrees with the transaction's type ═══
--
-- `transactions_category_shape` (`0000_schema.sql`) already refuses a
-- category on anything but income/expense — but it is a single-table CHECK,
-- so it cannot tell an income category from an expense one; that needs
-- `categories.kind`, a second table's row. Without this, switching a
-- quick-add draft's type after a category auto-filled (H1-b) could carry an
-- expense leaf onto an income row past a client bug, silently miscounting
-- both totals. The client's `createTransaction` controller already refuses
-- this (`transactions.categoryKindMismatch`), but a client-side refusal is
-- not a guarantee.
CREATE OR REPLACE FUNCTION assert_category_kind_matches_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  found_kind category_kind;
BEGIN
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;
  -- `transactions_category_shape` already refuses a category outside
  -- income/expense; nothing left to compare for a transfer or adjustment.
  IF NEW.type NOT IN ('income', 'expense') THEN RETURN NEW; END IF;

  SELECT kind INTO found_kind FROM categories WHERE id = NEW.category_id;
  -- The FK to `categories` already refuses an unknown id; a missing row here
  -- means that check has not run yet in this same statement.
  IF found_kind IS NULL THEN RETURN NEW; END IF;

  IF found_kind::text <> NEW.type::text THEN
    RAISE EXCEPTION
      'category % is % but the transaction is % (H1)',
      NEW.category_id, found_kind, NEW.type
      USING ERRCODE = 'WA017';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_category_kind_matches_type
  BEFORE INSERT OR UPDATE OF category_id, type
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_category_kind_matches_type();
