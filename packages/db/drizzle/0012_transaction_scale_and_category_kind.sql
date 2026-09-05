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
--   WA018  currency's decimals cannot be lowered under existing rows → validation
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
-- carry. L4 — the message below prints `trim_scale(v)` too, for the same
-- reason: printing the padded `48.90000000` back at a person is not the
-- figure they typed.
--
-- **M3 — identity travels with the raise, not with the SQLSTATE.** WA016 is
-- now shared by every trigger below (`transactions`, `debt_reassignments`,
-- and — H3/M1 further down — `transaction_lines`, `accounts`,
-- `recurring_transactions`, `targets`, `receipts`), so
-- `apps/api/src/common/pg-errors.ts` cannot tell them apart from the code
-- alone; it used to hard-wire WA016 to this one trigger's name, which
-- mislabelled every other one. Every `RAISE` here now sets `CONSTRAINT` to
-- its own trigger's name and `COLUMN` to the actual offending column —
-- `pg-errors.ts` reads both off the driver error rather than guessing from a
-- static map, and the column rides the envelope so a client can route the
-- refusal to the right field.
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
        'amount_original % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.amount_original), NEW.currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'transactions_amount_scale_matches_currency',
          COLUMN = 'amount_original';
    END IF;
  END IF;

  IF NEW.to_amount IS NOT NULL AND NEW.to_currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.to_currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.to_amount)) > allowed THEN
      RAISE EXCEPTION
        'to_amount % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.to_amount), NEW.to_currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'transactions_amount_scale_matches_currency',
          COLUMN = 'to_amount';
    END IF;
  END IF;

  IF NEW.debt_amount IS NOT NULL AND NEW.debt_currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.debt_currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.debt_amount)) > allowed THEN
      RAISE EXCEPTION
        'debt_amount % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.debt_amount), NEW.debt_currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'transactions_amount_scale_matches_currency',
          COLUMN = 'debt_amount';
    END IF;
  END IF;

  -- M — `fee` (S31 §9.1) is a fourth figure `numeric(20,8)` regardless of
  -- currency, and it carries no currency column of its own — it is always
  -- the row's own `currency`, so that is what its scale is checked against.
  IF NEW.fee IS NOT NULL AND NEW.currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.fee)) > allowed THEN
      RAISE EXCEPTION
        'fee % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.fee), NEW.currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'transactions_amount_scale_matches_currency',
          COLUMN = 'fee';
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
        'amount % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.amount), NEW.currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'debt_reassignments_amount_scale_matches_currency',
          COLUMN = 'amount';
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
--> statement-breakpoint

-- ═══ H3 — a split line past its own transaction's scale ═══════════════════
--
-- `transaction_lines.amount` (§6.10) carries no currency of its own — a
-- split belongs to the payment, not the photograph — so its scale has to be
-- checked against its *parent* `transactions.currency`. Nothing did:
-- `4.905 + 5.095 = 10.00` inserted fine and rendered as `4.91 + 5.10 = 10.01`
-- against a stated `10.00`, the same defect `assert_amount_scale` above
-- fixes for the parent row, one join away from it.
CREATE OR REPLACE FUNCTION assert_transaction_line_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
  parent_currency text;
BEGIN
  SELECT currency INTO parent_currency FROM transactions WHERE id = NEW.transaction_id;
  -- The FK to `transactions` already refuses an unknown id; a missing row
  -- here means that check has not run yet in this same statement.
  IF parent_currency IS NULL THEN RETURN NEW; END IF;

  SELECT decimals INTO allowed FROM currencies WHERE code = parent_currency;
  IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount)) > allowed THEN
    RAISE EXCEPTION
      'amount % holds more decimal places than % allows (%) (H3)',
      trim_scale(NEW.amount), parent_currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'transaction_lines_amount_scale_matches_currency',
        COLUMN = 'amount';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transaction_lines_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount, transaction_id
  ON transaction_lines
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_line_amount_scale();
--> statement-breakpoint

-- ═══ M1 — four more money columns with a sibling currency, unguarded ══════
--
-- `accounts.opening_balance`/`expected_balance` (against `accounts.currency`
-- — the same row), `recurring_transactions.amount_original` (against its
-- own `currency`), `targets.amount` (against its own `currency`), and
-- `receipts.total` (against its own `currency`, both nullable — a receipt
-- can arrive before OCR has read either). Each is the identical guarantee
-- `assert_amount_scale` already states for `transactions`, applied to a
-- table that guarantee never reaches. `opening_balance` is the sharpest of
-- the four — it shifts every balance computed from it, forever — and
-- `recurring_transactions` is the most visible: an over-scale rule used to
-- insert fine and then refuse every occurrence it ever generates.
CREATE OR REPLACE FUNCTION assert_account_balance_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  IF allowed IS NULL THEN RETURN NEW; END IF;

  IF scale(trim_scale(NEW.opening_balance)) > allowed THEN
    RAISE EXCEPTION
      'opening_balance % holds more decimal places than % allows (%) (M1)',
      trim_scale(NEW.opening_balance), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'accounts_balance_scale_matches_currency',
        COLUMN = 'opening_balance';
  END IF;

  IF NEW.expected_balance IS NOT NULL AND scale(trim_scale(NEW.expected_balance)) > allowed THEN
    RAISE EXCEPTION
      'expected_balance % holds more decimal places than % allows (%) (M1)',
      trim_scale(NEW.expected_balance), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'accounts_balance_scale_matches_currency',
        COLUMN = 'expected_balance';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounts_balance_scale_matches_currency
  BEFORE INSERT OR UPDATE OF opening_balance, expected_balance, currency
  ON accounts
  FOR EACH ROW EXECUTE FUNCTION assert_account_balance_scale();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_recurring_transaction_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  IF NEW.amount_original IS NULL OR NEW.currency IS NULL THEN RETURN NEW; END IF;
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount_original)) > allowed THEN
    RAISE EXCEPTION
      'amount_original % holds more decimal places than % allows (%) (M1)',
      trim_scale(NEW.amount_original), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'recurring_transactions_amount_scale_matches_currency',
        COLUMN = 'amount_original';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER recurring_transactions_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount_original, currency
  ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION assert_recurring_transaction_amount_scale();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_target_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  IF NEW.amount IS NULL OR NEW.currency IS NULL THEN RETURN NEW; END IF;
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount)) > allowed THEN
    RAISE EXCEPTION
      'amount % holds more decimal places than % allows (%) (M1)',
      trim_scale(NEW.amount), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'targets_amount_scale_matches_currency',
        COLUMN = 'amount';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER targets_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount, currency
  ON targets
  FOR EACH ROW EXECUTE FUNCTION assert_target_amount_scale();
--> statement-breakpoint

-- `total`/`currency` are both nullable — a receipt row can exist before OCR
-- has populated either — so this is checked only once both are present,
-- the same shape `assert_amount_scale` already gives every optional pair.
CREATE OR REPLACE FUNCTION assert_receipt_total_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  IF NEW.total IS NULL OR NEW.currency IS NULL THEN RETURN NEW; END IF;
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  IF allowed IS NOT NULL AND scale(trim_scale(NEW.total)) > allowed THEN
    RAISE EXCEPTION
      'total % holds more decimal places than % allows (%) (M1)',
      trim_scale(NEW.total), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'receipts_total_scale_matches_currency',
        COLUMN = 'total';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER receipts_total_scale_matches_currency
  BEFORE INSERT OR UPDATE OF total, currency
  ON receipts
  FOR EACH ROW EXECUTE FUNCTION assert_receipt_total_scale();
--> statement-breakpoint

-- ═══ C1 — lowering a currency's own `decimals` under existing rows ════════
--
-- `currencies.decimals` (`update_currency`, `currencyPatch.decimals` in
-- `packages/core/src/registry/inputs.ts`) is an unconstrained `int 0–8` —
-- nothing re-validated the rows it governs. `XAA decimals=8`, a row storing
-- `amount_original=48.90512340`, then `UPDATE currencies SET decimals=2`
-- succeeded, and the row was now un-editable: any later update of it fired
-- WA016 on a value it had already held before the currency changed under it.
--
-- Shaped after `accounts_change_safe` (WA013, `0001_database_objects.sql`):
-- a currency change is refused, not silently accepted, when it would
-- invalidate a row that already exists. Every table the H2/H3/M1 triggers
-- above cover is checked here in turn — a widening (or unchanged) `decimals`
-- always passes without a single lookup, since nothing that fit the old,
-- smaller scale can fail to fit a larger one.
CREATE OR REPLACE FUNCTION assert_currency_decimals_safe()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.decimals >= OLD.decimals THEN RETURN NEW; END IF;

  SELECT count(*) INTO n FROM transactions
  WHERE deleted_at IS NULL AND (
    (currency = NEW.code AND scale(trim_scale(amount_original)) > NEW.decimals)
    OR (currency = NEW.code AND fee IS NOT NULL AND scale(trim_scale(fee)) > NEW.decimals)
    OR (to_currency = NEW.code AND scale(trim_scale(to_amount)) > NEW.decimals)
    OR (debt_currency = NEW.code AND scale(trim_scale(debt_amount)) > NEW.decimals)
  );
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % transaction row(s) hold a figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;

  SELECT count(*) INTO n FROM debt_reassignments
  WHERE currency = NEW.code AND scale(trim_scale(amount)) > NEW.decimals;
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % debt reassignment(s) hold a figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;

  SELECT count(*) INTO n FROM transaction_lines tl
  JOIN transactions t ON t.id = tl.transaction_id
  WHERE t.currency = NEW.code AND scale(trim_scale(tl.amount)) > NEW.decimals;
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % transaction line(s) hold a figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;

  SELECT count(*) INTO n FROM accounts
  WHERE currency = NEW.code AND (
    scale(trim_scale(opening_balance)) > NEW.decimals
    OR (expected_balance IS NOT NULL AND scale(trim_scale(expected_balance)) > NEW.decimals)
  );
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % account(s) hold a balance with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;

  SELECT count(*) INTO n FROM recurring_transactions
  WHERE currency = NEW.code AND scale(trim_scale(amount_original)) > NEW.decimals;
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % recurring transaction(s) hold a figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER currencies_decimals_safe
  BEFORE UPDATE OF decimals ON currencies
  FOR EACH ROW EXECUTE FUNCTION assert_currency_decimals_safe();

-- M2's own `fee` sign constraint (`transactions_fee_positive`) is dropped
-- from here as of the rebase onto main for #118: `0009_transactions_to_amount_and_fee_positive.sql`
-- landed the same guarantee first, stricter (`> 0`, not `>= 0` — a zero fee
-- is repaired to `NULL` there too), so re-adding the same constraint name
-- here would fail outright rather than merely duplicate it.
