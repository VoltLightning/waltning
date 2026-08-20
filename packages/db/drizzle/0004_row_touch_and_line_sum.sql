-- Hand-written. `0003_row_version.sql` added the columns; this makes them mean
-- something, and adds the one cross-table invariant `transaction_lines` never
-- had.
--
-- SQLSTATE catalogue, continued from `0001_database_objects.sql`:
--
--   WA015  split lines do not sum to the parent  → validation
--
-- ═══ 1 ── `updated_at` never advanced ════════════════════════════════════
--
-- Five tables declared `updated_at ... DEFAULT now() NOT NULL` and **nothing
-- ever wrote it again**. Every row in the database reported its insert time as
-- its last edit, permanently. That was cosmetic while it only fed a "last
-- edited" label; it stopped being cosmetic when `architecture/14` made a
-- row's version the thing a conflicting write is detected against.
--
-- `now()` is transaction time, so two updates inside one transaction get the
-- *same* `updated_at` and different `version`s. That is precisely why the
-- token is the bigint and not the timestamp.

CREATE OR REPLACE FUNCTION touch_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- **`OLD.version + 1`, never `NEW.version + 1`.** A client carries back the
-- version it last read so the server can compare it; it must not be able to
-- *set* the next one. Reading from OLD means the increment is the database's,
-- whatever the payload claimed.
--
-- No `WHEN (OLD.* IS DISTINCT FROM NEW.*)` guard. It would skip the bump on a
-- no-op UPDATE, which sounds right and is unreliable here: in a BEFORE trigger
-- the generated columns (`amount_pivot`, `to_amount_pivot`) are NULL in NEW and
-- populated in OLD, so whole-row comparison is always true on `transactions`
-- and the guard would apply to five tables out of six. An UPDATE is a write;
-- counting it as one is both simpler and honest.
CREATE OR REPLACE FUNCTION touch_row_versioned()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version    := OLD.version + 1;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER accounts_touch
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint
CREATE TRIGGER categories_touch
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint
CREATE TRIGGER counterparties_touch
  BEFORE UPDATE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint
CREATE TRIGGER currencies_touch
  BEFORE UPDATE ON currencies
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint
CREATE TRIGGER recurring_transactions_touch
  BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint
CREATE TRIGGER transactions_touch
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION touch_row_versioned();
--> statement-breakpoint

-- `debt_reassignments` gets the timestamp and no version. It is a server-only
-- migration artefact: the phone never holds the table, so there is no second
-- writer for a version to arbitrate between.
CREATE TRIGGER debt_reassignments_touch
  BEFORE UPDATE ON debt_reassignments
  FOR EACH ROW EXECUTE FUNCTION touch_row();
--> statement-breakpoint

-- ═══ 2 ── Split lines could sum to anything ══════════════════════════════
--
-- `transaction_lines` is a split of one transaction. Nothing required the
-- split to add up, so a 100.00 grocery row could carry lines of 30.00 and
-- 40.00 and every per-category figure derived from lines would be quietly
-- short by 30.00 — while the account balance, which reads `amount_original`,
-- stayed right. A disagreement between two views of the same money, with
-- neither side looking wrong on its own.
--
-- Deferred, because it cannot be true statement-by-statement: replacing a
-- two-line split with a three-line one is legal and passes through states
-- where the sum is wrong. `currencies_exactly_one_pivot` is deferred for the
-- same reason and is the precedent.

CREATE OR REPLACE FUNCTION assert_lines_sum(txn uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  line_total numeric(20,8);
  txn_amount numeric(20,8);
BEGIN
  IF txn IS NULL THEN RETURN; END IF;

  SELECT sum(amount) INTO line_total
    FROM transaction_lines WHERE transaction_id = txn;

  -- No lines is not a violation. A split is optional, and deleting the last
  -- line un-splits the transaction rather than corrupting it.
  IF line_total IS NULL THEN RETURN; END IF;

  SELECT amount_original INTO txn_amount FROM transactions WHERE id = txn;

  -- The parent is gone: ON DELETE CASCADE removed the transaction and its
  -- lines together, and there is nothing left for them to disagree with.
  IF txn_amount IS NULL THEN RETURN; END IF;

  IF line_total <> txn_amount THEN
    RAISE EXCEPTION
      'split lines sum to % but the transaction is % (SPEC.md §6.5)',
      line_total, txn_amount
      USING ERRCODE = 'WA015';
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_lines_sum_for_line()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_lines_sum(COALESCE(NEW.transaction_id, OLD.transaction_id));
  RETURN NULL;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_lines_sum_for_txn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_lines_sum(NEW.id);
  RETURN NULL;
END $$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER transaction_lines_sum_matches
  AFTER INSERT OR UPDATE OR DELETE ON transaction_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_lines_sum_for_line();
--> statement-breakpoint

-- Moving the parent's amount breaks the same invariant from the other side.
-- `UPDATE OF amount_original` rather than every UPDATE, so a payee edit on a
-- split transaction does not pay for this.
CREATE CONSTRAINT TRIGGER transactions_lines_sum_matches
  AFTER UPDATE OF amount_original ON transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_lines_sum_for_txn();
