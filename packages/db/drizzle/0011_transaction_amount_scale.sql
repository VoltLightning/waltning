-- Hand-written, matching `0001_database_objects.sql`'s own precedent: a
-- cross-table invariant a CHECK cannot state, because it needs a second
-- table's row. `wave-4-shared.md`'s coordination note applies — another PR
-- this wave adds its own migration off the same base; the orchestrator
-- renumbers whichever one lands second.
--
-- SQLSTATE catalogue, continued from `0004_row_touch_and_line_sum.sql`:
--
--   WA016  amount holds more decimals than its currency  → validation
--
-- ═══ H2 — a figure past its own currency's scale ══════════════════════════
--
-- `amount_original` is `numeric(20,8)` on every row regardless of currency,
-- so nothing stopped a PLN transaction (two decimal places, `currencies.
-- decimals`) from storing `48.905`. The client already refuses this
-- (`create-phone-ledger.ts`'s own `transactions.tooManyDecimals`), but a
-- client-side refusal is not a guarantee — `CLAUDE.md`: "New guarantee → new
-- constraint" — and a row reaching Postgres by any other path (a future
-- import, a script, a bug in that refusal) would sit past the precision its
-- own currency claims to hold.
--
-- **`trim_scale`, not `scale`.** `amount_original`'s column type already
-- fixes its *declared* scale at 8, so `scale(amount_original)` reads 8 on
-- every row regardless of how many of those digits are genuinely
-- significant — "48.90" cast into `numeric(20,8)` stores as
-- "48.90000000" and a bare `scale()` cannot tell it apart from "48.90512340".
-- `trim_scale` removes the trailing zeros first, so `scale(trim_scale(v))`
-- answers the question this guarantee is actually about: how many decimal
-- places did the figure itself carry.
CREATE OR REPLACE FUNCTION assert_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  -- The FK to `currencies` already refuses an unknown code; a missing row
  -- here means that check has not run yet in this same statement, not that
  -- the guarantee can be skipped.
  IF allowed IS NULL THEN RETURN NEW; END IF;

  IF scale(trim_scale(NEW.amount_original)) > allowed THEN
    RAISE EXCEPTION
      'amount % holds more decimal places than % (% allows %) (H2)',
      NEW.amount_original, NEW.currency, NEW.currency, allowed
      USING ERRCODE = 'WA016';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount_original, currency
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_amount_scale();
