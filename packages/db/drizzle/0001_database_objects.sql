-- Database objects: everything the ORM cannot express.
--
-- `0000_schema.sql` is generated from `schema.ts` by drizzle-kit and holds the
-- table layer — columns, indexes, foreign keys, and the CHECKs Drizzle models.
-- This file holds the rest, and the rest is where most of this system's
-- guarantees live: triggers, the functions behind them, views, the tax export
-- role and its enumerated REVOKEs, exclusion constraints, and the five CHECKs
-- whose predicates Drizzle has no way to state.
--
-- Assembled from migrations 0000-0009 of the pre-baseline history, with their
-- comments intact, then verified by diffing the resulting schema against a
-- database built from those ten files: 33 tables, 10 triggers, 5 views, 31
-- CHECK constraints, 1 exclusion constraint, 1 role — identical.
--
-- Hand-written on purpose. When the table layer changes, run `pnpm db:generate`
-- and it produces a new numbered migration; when a guarantee changes, edit here.
--
-- ── Every guard raises its own SQLSTATE ──────────────────────────────────────
--
-- All fifteen RAISEs below used `check_violation` (23514). Fifteen different
-- guarantees, one code: nothing reading the error could tell "this period is
-- filed" from "that category has children", and the only thing left to key on
-- was English message text.
--
-- That is not cosmetic. `architecture/09` retries a 5xx and never retries a
-- `period_closed`, so a queued edit into a filed period came back as `internal`
-- and the outbox would retry a permanently-refused write forever — the period
-- does not reopen on its own.
--
-- Class `WA` is ours: PostgreSQL reserves the classes listed in Appendix A and
-- `WA` is not among them, so these cannot collide with a future server code.
-- `apps/api/src/common/pg-errors.ts` maps them, and a test drives every guard
-- against real Postgres to prove the code that comes back is the one here.
--
--   WA001  a closed tax period                 → period_closed
--   WA002  exactly one pivot currency          → validation
--   WA003  transaction currency ≠ account      → validation
--   WA004  transfer currency ≠ destination     → validation
--   WA005  category is a group, not a leaf     → validation
--   WA006  category has children, not a leaf   → validation
--   WA007  category under a leaf               → validation
--   WA008  category still holds transactions   → validation
--   WA009  category kind ≠ parent kind         → validation
--   WA010  children of a different kind        → validation
--   WA011  business row in a shared account    → validation
--   WA012  business row into a shared account  → validation
--   WA013  account currency change with rows   → validation
--   WA014  account made shared with business   → validation
--   WA019  archived category assigned         → validation
--
-- Only WA001 maps to something other than `validation`, and that is the whole
-- point: it is the one whose handling differs.

-- ═══ from 0002_adversarial_review_fixes.sql ═══════════════════
--> statement-breakpoint
ALTER TABLE "tax_lines" ADD CONSTRAINT "tax_lines_deduction_rate_sane"
	CHECK ("deduction_rate" IS NULL OR "deduction_rate" BETWEEN 0 AND 1);
--> statement-breakpoint
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
      USING ERRCODE = 'WA002';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER currencies_exactly_one_pivot
  AFTER INSERT OR UPDATE OR DELETE ON currencies
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_exactly_one_pivot();
--> statement-breakpoint
-- 8 ── Targets could contradict themselves.
--
-- No unique key, no date sanity, so two overlapping targets for the same
-- category are both legal and §14.7's progress bar has two answers and picks by
-- row order.
ALTER TABLE "targets" ADD CONSTRAINT "targets_range_sane"
	CHECK ("active_to" IS NULL OR "active_to" >= "active_from");
--> statement-breakpoint
-- 9 ── Scheme versions could overlap.
ALTER TABLE "tax_schemes" ADD CONSTRAINT "tax_schemes_range_sane"
	CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
--> statement-breakpoint
-- ═══ from 0003_cross_table_invariants.sql ═════════════════════
--> statement-breakpoint
-- Three invariants a CHECK cannot express, because each spans two tables.
-- SPEC.md §6.5. Each one is a rule the design elsewhere claims as a guarantee,
-- which is the only reason a trigger is justified over application code.

-- 1 ── A transaction's currency is its account's currency.
--
-- §7.1 states that `amount_original` *is* denominated in the account's
-- currency. Nothing enforced it, so a USD amount could sit on a PLN account
-- and every balance, conversion and report downstream would be wrong while
-- looking entirely well-formed.
CREATE OR REPLACE FUNCTION assert_transaction_currency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_ccy text;
  target_ccy  text;
BEGIN
  SELECT currency INTO account_ccy FROM accounts WHERE id = NEW.account_id;
  IF NEW.currency <> account_ccy THEN
    RAISE EXCEPTION
      'transaction currency % does not match account currency % (account %)',
      NEW.currency, account_ccy, NEW.account_id
      USING ERRCODE = 'WA003';
  END IF;

  IF NEW.to_account_id IS NOT NULL THEN
    SELECT currency INTO target_ccy FROM accounts WHERE id = NEW.to_account_id;
    IF NEW.to_currency <> target_ccy THEN
      RAISE EXCEPTION
        'transfer to_currency % does not match destination account currency % (account %)',
        NEW.to_currency, target_ccy, NEW.to_account_id
        USING ERRCODE = 'WA004';
    END IF;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_currency_matches_account
  BEFORE INSERT OR UPDATE OF account_id, currency, to_account_id, to_currency
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_currency();
--> statement-breakpoint
-- 2 ── Only leaves are assignable.
--
-- TAXONOMY.md R1 — "a category is a group OR a leaf, never both" — is called
-- the single rule that eliminates faults 1, 2 and 3, and it is the exact
-- defect that left 705 transactions sitting on the `Food` parent in Money
-- Manager. It was stated everywhere and enforced nowhere.
CREATE OR REPLACE FUNCTION assert_category_is_leaf()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  leaf boolean;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_leaf INTO leaf FROM categories WHERE id = NEW.category_id;
  IF NOT leaf THEN
    RAISE EXCEPTION
      'category % is a group, not a leaf — only leaves are assignable (TAXONOMY.md R1)',
      NEW.category_id
      USING ERRCODE = 'WA005';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_category_is_leaf
  BEFORE INSERT OR UPDATE OF category_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_category_is_leaf();
--> statement-breakpoint
CREATE TRIGGER transaction_lines_category_is_leaf
  BEFORE INSERT OR UPDATE OF category_id ON transaction_lines
  FOR EACH ROW EXECUTE FUNCTION assert_category_is_leaf();
--> statement-breakpoint
-- A category cannot claim to be a leaf while holding children, nor become a
-- group while transactions still point at it. Without this, R1 holds only for
-- rows written after the parent was correctly flagged.
CREATE OR REPLACE FUNCTION assert_category_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_leaf AND EXISTS (
    SELECT 1 FROM categories WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'category % has children and cannot be a leaf', NEW.id
      USING ERRCODE = 'WA006';
  END IF;

  -- The other direction. Without this, inserting a child under a LEAF that
  -- already holds transactions silently recreates the Money Manager defect
  -- (705 rows on the `Food` parent) without touching the parent row at all.
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.parent_id AND is_leaf
  ) THEN
    RAISE EXCEPTION
      'category % cannot be a child of leaf %', NEW.id, NEW.parent_id
      USING ERRCODE = 'WA007';
  END IF;

  IF NOT NEW.is_leaf AND EXISTS (
    SELECT 1 FROM transactions
    WHERE category_id = NEW.id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'category % still has transactions and cannot become a group', NEW.id
      USING ERRCODE = 'WA008';
  END IF;

  -- A child must share its parent's kind: an income leaf under an expense
  -- group would be assignable from the wrong picker and would sum into the
  -- wrong side of every report.
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories p
    WHERE p.id = NEW.parent_id AND p.kind <> NEW.kind
  ) THEN
    RAISE EXCEPTION 'category % kind does not match its parent', NEW.id
      USING ERRCODE = 'WA009';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER categories_shape
  AFTER INSERT OR UPDATE OF is_leaf, parent_id, kind ON categories
  FOR EACH ROW EXECUTE FUNCTION assert_category_shape();
--> statement-breakpoint
-- Changing a PARENT's kind never revalidated its children, so an income leaf
-- could end up under an expense group — offered by the wrong picker and summed
-- into the wrong side of every report.
CREATE OR REPLACE FUNCTION assert_children_kind()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM categories WHERE parent_id = NEW.id AND kind <> NEW.kind
  ) THEN
    RAISE EXCEPTION 'category % has children of a different kind', NEW.id
      USING ERRCODE = 'WA010';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER categories_children_kind
  AFTER UPDATE OF kind ON categories
  FOR EACH ROW EXECUTE FUNCTION assert_children_kind();
--> statement-breakpoint
-- 2b ── An archived category is never assignable.
--
-- H1a. Archiving is how a category leaves the pickers: `listCategories` (and
-- every sheet drawn from it) already drops archived rows, so nothing offers
-- one and nothing can render its name. What still reached the row was D2's
-- payee memory — a proposal read off *history*, which remembers the leaf a
-- payee last sat on whether or not it has since been archived — so the desk
-- command bar auto-filled an id it then displayed as "Category?" and Enter
-- saved it: a transaction on a leaf no picker offers, invisible in the
-- composer that wrote it.
--
-- `readPayeeHistory` now excludes archived categories and the client refuses
-- one before the write (`transactions.categoryUnavailable`), the same
-- layering `assert_category_kind_matches_type` has against its own client
-- check. Neither is a guarantee; this is.
--
-- **Assignment only, never the archiving.** Archiving a category that already
-- holds rows stays legal — that is the entire point of archiving rather than
-- deleting, and §7's history does not rewrite itself. The trigger is on the
-- rows that point at a category, fired by the write that would *newly* do so.
CREATE OR REPLACE FUNCTION assert_category_not_archived()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_archived boolean;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT archived INTO is_archived FROM categories WHERE id = NEW.category_id;
  -- The FK to `categories` already refuses an unknown id; a missing row here
  -- means that check has not run yet in this same statement, the same call
  -- `assert_category_is_leaf` makes above.
  IF is_archived THEN
    -- L7 — `CONSTRAINT` names the raiser, because two triggers share this one
    -- function: without it both refusals arrive carrying no constraint at all
    -- and `pg-errors.ts` falls back to its WA019 default, so a line's
    -- refusal is indistinguishable from a transaction's. `TG_TABLE_NAME`
    -- rather than a literal — the trigger names are `<table>_category_not_
    -- archived` on both tables, so the function stays one function.
    RAISE EXCEPTION
      'category % is archived — an archived category is not assignable (H1a)',
      NEW.category_id
      USING ERRCODE = 'WA019',
            CONSTRAINT = TG_TABLE_NAME || '_category_not_archived',
            COLUMN = 'category_id';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_category_not_archived
  BEFORE INSERT OR UPDATE OF category_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_category_not_archived();
--> statement-breakpoint
CREATE TRIGGER transaction_lines_category_not_archived
  BEFORE INSERT OR UPDATE OF category_id ON transaction_lines
  FOR EACH ROW EXECUTE FUNCTION assert_category_not_archived();
--> statement-breakpoint
-- 3 ── Shared money is never business.
--
-- §6.7 says the combination "is invalid and constrained against", and
-- `accounts_shared_not_business` does constrain it — at the account level only.
-- A transaction carrying is_business = true in a jointly-owned account passed
-- every check and would reach `tax_ledger`: a hole in T1 (§13.1), the
-- guarantee the entire tax argument rests on.
CREATE OR REPLACE FUNCTION assert_business_not_shared()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_business AND EXISTS (
    SELECT 1 FROM accounts
    WHERE id = NEW.account_id AND ownership = 'shared'
  ) THEN
    RAISE EXCEPTION
      'a business transaction cannot sit in a shared account (SPEC.md §6.7, §13.1)'
      USING ERRCODE = 'WA011';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_business_not_shared
  BEFORE INSERT OR UPDATE OF is_business, account_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_business_not_shared();
--> statement-breakpoint
-- A transfer INTO a shared account was unguarded: only account_id was tested.
CREATE OR REPLACE FUNCTION assert_business_not_shared_target()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_business AND NEW.to_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounts
    WHERE id = NEW.to_account_id AND ownership = 'shared'
  ) THEN
    RAISE EXCEPTION
      'a business transaction cannot move into a shared account (SPEC.md §6.7)'
      USING ERRCODE = 'WA012';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_business_not_shared_target
  BEFORE INSERT OR UPDATE OF is_business, to_account_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_business_not_shared_target();
--> statement-breakpoint
-- 4 ── The account side of all three invariants.
--
-- Every trigger above lives on `transactions`. Mutating `accounts` walked past
-- all of them: changing an account's currency left 3,000 rows denominated in
-- something else, and flipping ownership to 'shared' pushed every business row
-- it held straight into `tax_ledger`. One UPDATE on a different table defeated
-- §13.1 point 5a entirely.
CREATE OR REPLACE FUNCTION assert_account_change_safe()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    SELECT count(*) INTO n FROM transactions
    WHERE (account_id = NEW.id OR to_account_id = NEW.id) AND deleted_at IS NULL;
    IF n > 0 THEN
      RAISE EXCEPTION
        'cannot change the currency of account % — % transactions are denominated in %',
        NEW.id, n, OLD.currency
        USING ERRCODE = 'WA013';
    END IF;
  END IF;

  IF NEW.ownership = 'shared' AND OLD.ownership <> 'shared' THEN
    SELECT count(*) INTO n FROM transactions
    WHERE (account_id = NEW.id OR to_account_id = NEW.id)
      AND is_business AND deleted_at IS NULL;
    IF n > 0 THEN
      RAISE EXCEPTION
        'cannot make account % shared — it holds % business transactions (SPEC.md §6.7)',
        NEW.id, n
        USING ERRCODE = 'WA014';
    END IF;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounts_change_safe
  BEFORE UPDATE OF currency, ownership ON accounts
  FOR EACH ROW EXECUTE FUNCTION assert_account_change_safe();
--> statement-breakpoint
-- ═══ from 0004_business_logic_columns.sql ═════════════════════
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_shape"
	CHECK (("debt_currency" IS NULL) = ("debt_amount" IS NULL));
--> statement-breakpoint
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
      USING ERRCODE = 'WA001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_period_not_closed
  BEFORE INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_period_not_closed();
--> statement-breakpoint
-- ═══ from 0005_tax_ledger_roles.sql ═══════════════════════════
--> statement-breakpoint
-- T1, actually built.
--
-- §13.1 has claimed since the first draft that a personal row structurally
-- cannot reach a tax output, enforced by a Postgres role holding SELECT on a
-- view and no privilege on the base table. Repo-wide, `tax_ledger` appeared in
-- SQL exactly once — in a comment. Zero CREATE ROLE, zero GRANT, zero REVOKE,
-- zero CREATE VIEW. The guarantee the whole tax argument rests on was prose.
--
-- Roles are cluster-wide and pg_dump does not carry them (§5.4), so this file
-- must be re-applied after any restore into a fresh cluster — and §15.1's probe
-- below is what detects that it was not.

-- ── 1. The view ─────────────────────────────────────────────────────────────
--
-- Three predicates, not one. `is_business` was the only one specified; the
-- ownership join closes the hole where S16's retroactive own→shared flip leaves
-- business rows sitting in a shared account and still visible here.
CREATE OR REPLACE VIEW tax_ledger AS
  SELECT t.id, t.date, t.type, t.account_id, t.category_id,
         t.counterparty_id, t.counterparty_tax_id, t.document_ref, t.ksef_id,
         t.ryczalt_rate, t.ryczalt_activity,
         t.amount_original, t.currency, t.fx_rate, t.fx_rate_estimated,
         t.amount_pivot, t.payee, t.note
  FROM   transactions t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own';
--> statement-breakpoint
-- ── 2. The role ─────────────────────────────────────────────────────────────
--
-- NOLOGIN by default; the deployment grants it to a login role holding only the
-- export credential. The REVOKEs are the point: an enumerated denial, because
-- personal rows also live in agent_tool_calls.output, import_rows.raw,
-- receipts.ocr_json and transaction_lines — and GRANT SELECT ON ALL TABLES is
-- what a tired person types at 2am.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waltning_export') THEN
    CREATE ROLE waltning_export NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO waltning_export;
--> statement-breakpoint
GRANT SELECT ON tax_ledger TO waltning_export;
--> statement-breakpoint
REVOKE ALL ON transactions        FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON transaction_lines   FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON receipts            FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON import_rows         FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON agent_tool_calls    FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON agent_messages      FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON agent_memory        FROM waltning_export;
--> statement-breakpoint
REVOKE ALL ON audit_log           FROM waltning_export;
--> statement-breakpoint
-- Nothing added later is readable by accident.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM waltning_export;
--> statement-breakpoint
-- ── 3. The omission check ───────────────────────────────────────────────────
--
-- Every mechanism in §13.1 prevents a personal row ENTERING a tax output. Under
-- ryczalt only revenue is reportable, so the material failure is the opposite:
-- a revenue row never marked business and therefore silently absent —
-- under-declared revenue, which is the direction a tax authority penalises.
-- is_business defaults false and migration sets it nowhere, so this is the
-- likely state rather than the unlucky one.
CREATE OR REPLACE VIEW tax_omission_candidates AS
  SELECT t.id, t.date, t.payee, t.amount_original, t.currency, t.counterparty_id
  FROM   transactions t
  JOIN   accounts a  ON a.id = t.account_id
  JOIN   categories c ON c.id = t.category_id
  WHERE  t.type = 'income'
    AND  c.is_earnings = true
    AND  a.ownership = 'own'
    AND  t.is_business = false
    AND  t.deleted_at IS NULL;
--> statement-breakpoint
-- ── 4. Falsifiable assertions ───────────────────────────────────────────────
--
-- §15.1's invariant "tax_ledger contains zero rows with is_business = false" is
-- guaranteed by the view's own WHERE clause. It is unfalsifiable: it cannot
-- detect a redefined view, a dropped view, a missing role, or a grant on the
-- base table — which is every way T1 actually fails.
--
-- These three can each return false.
CREATE OR REPLACE FUNCTION verify_t1()
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql AS $$
DECLARE
  defn text;
  n_view bigint;
  n_base bigint;
BEGIN
  -- (a) the view is what we think it is
  SELECT pg_get_viewdef('tax_ledger'::regclass, true) INTO defn;
  RETURN QUERY SELECT
    'view_definition_pinned',
    defn LIKE '%is_business%' AND defn LIKE '%deleted_at%' AND defn LIKE '%ownership%',
    'view must filter is_business, deleted_at and ownership';

  -- (b) the role genuinely cannot read the base table
  RETURN QUERY SELECT
    'export_role_denied_base_table',
    NOT has_table_privilege('waltning_export', 'transactions', 'SELECT'),
    'waltning_export must have no SELECT on transactions';

  -- (c) the counts agree, computed from BOTH sides
  SELECT count(*) INTO n_view FROM tax_ledger;
  SELECT count(*) INTO n_base FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.is_business AND t.deleted_at IS NULL AND a.ownership = 'own';
  RETURN QUERY SELECT
    'view_matches_base_predicate',
    n_view = n_base,
    format('view %s vs base %s', n_view, n_base);
END $$;
--> statement-breakpoint
-- ── 5. The one the register calls the sharpest finding ──────────────────────
CREATE OR REPLACE FUNCTION verify_no_omitted_revenue()
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM tax_omission_candidates;
  RETURN QUERY SELECT
    'no_unmarked_revenue',
    n = 0,
    format('%s earnings-income rows in own accounts are not marked business', n);
END $$;
--> statement-breakpoint
-- ═══ from 0006_period_guard_both_dates.sql ════════════════════
--> statement-breakpoint
-- The closed-period guard checked one date; a move has two.
--
-- `0004` evaluated `coalesce(NEW.date, OLD.date)`. On UPDATE that is always
-- NEW.date, because `date` is NOT NULL — so the guard asked "is the row's
-- DESTINATION in a closed period?" and never "did it come out of one?"
--
-- Moving a filed transaction from February to June therefore succeeded. Nothing
-- was inserted, deleted or edited in the closed period by any reading the
-- trigger could take, and yet February's total silently dropped by the amount
-- of that row — after the period was filed against it. This is worse than the
-- backdating case the guard was written for: backdating shows up as a row you
-- did not expect, and a move shows up as nothing at all.
--
-- A move touches two periods. Both have to be open.
--
-- Second, worse defect in the same eight lines: it ended `RETURN NEW`, and in a
-- BEFORE DELETE trigger `NEW` is NULL. Returning NULL from a BEFORE trigger
-- cancels the operation — so **every** DELETE on `transactions` was silently
-- suppressed, in open periods as much as closed ones, and Postgres reported
-- `DELETE 0` as ordinary success rather than an error. A guard written to
-- refuse some deletes refused all of them, quietly. The row count is the only
-- thing that would have told you, and only if you looked.
--
-- Both defects were found by running the trigger, not by reading it. That is
-- the whole argument of `defects.md` arriving one layer down: the fix for
-- "asserting is not enforcing" is itself an assertion until it is executed.
CREATE OR REPLACE FUNCTION assert_period_not_closed()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d date;
BEGIN
  FOREACH d IN ARRAY (
    CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.date]
      WHEN 'DELETE' THEN ARRAY[OLD.date]
      ELSE ARRAY[OLD.date, NEW.date]   -- UPDATE: origin and destination
    END
  ) LOOP
    IF EXISTS (
      SELECT 1 FROM tax_period_locks l
      WHERE l.reopened_at IS NULL
        AND d BETWEEN l.period_start AND l.period_end
    ) THEN
      RAISE EXCEPTION
        'transaction dated % falls in a closed tax period — reopen it first (SPEC.md §13.4)', d
        USING ERRCODE = 'WA001';
    END IF;
  END LOOP;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
-- ═══ from 0007_debt_reassignments.sql ═════════════════════════
--> statement-breakpoint
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
--> statement-breakpoint
-- ═══ from 0008_memory_figure_check.sql ════════════════════════
--> statement-breakpoint
-- Worth stating plainly: this is a guard, not a proof. A determined sentence
-- can still smuggle a fact past it ("rent went up by a third"). The CHECK stops
-- the mechanical failure — a number copied out of the ledger into a prompt
-- prefix, where it silently goes stale — and S32 is what covers the rest, by
-- keeping every memory listed, editable and deletable. Defence in depth, with
-- the cheap layer doing the mechanical part.
COMMENT ON CONSTRAINT "agent_memory_no_figures" ON "agent_memory" IS
  'Behaviour, never facts (SPEC.md §11.6). Refuses currency-adjacent numbers, '
  '4+ digit runs and 2dp quantities. Deliberately permits ratios (50/50), clock '
  'times (22:00) and small counts, which are behaviour and cannot drift.';
--> statement-breakpoint
-- ═══ from 0009_residency_and_rate_day.sql ═════════════════════
--> statement-breakpoint
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
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "tax_residency" ADD CONSTRAINT "tax_residency_no_overlap"
  EXCLUDE USING gist (
    daterange("valid_from", "valid_to", '[)') WITH &&
  );
--> statement-breakpoint
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
    AND  next_from > valid_to;
--> statement-breakpoint
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
END $$;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tax_fx_shape"
  CHECK (("tax_fx_rate" IS NULL) = ("tax_fx_date" IS NULL));
--> statement-breakpoint
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
    AND  a.ownership = 'own';
--> statement-breakpoint
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

--> statement-breakpoint
-- ═══ cross-table invariant Drizzle cannot express ════════════════════════
--
-- A category's tax line must belong to the SAME scheme as the mapping. Drizzle
-- models the single-column FK (tax_line_id → tax_lines.id) and has no way to
-- state the composite one, so a rebuild from schema.ts alone silently dropped
-- this — a category could map to a line from a different tax scheme and the
-- database would accept it.
ALTER TABLE "tax_lines" ADD CONSTRAINT "tax_lines_id_scheme_uq" UNIQUE ("id", "scheme_id");
--> statement-breakpoint
ALTER TABLE "category_tax_map" DROP CONSTRAINT IF EXISTS "category_tax_map_tax_line_id_tax_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "category_tax_map" ADD CONSTRAINT "category_tax_map_line_in_scheme_fk"
  FOREIGN KEY ("tax_line_id", "scheme_id") REFERENCES "tax_lines"("id", "scheme_id") ON DELETE CASCADE;

--> statement-breakpoint
-- ═══ the application role ════════════════════════════════════════════════
--
-- §5.7 and §13.1: the API must not be a superuser. A superuser bypasses every
-- GRANT, so `waltning_export`'s enumerated REVOKEs — the whole of T1 — mean
-- nothing while every query still succeeds. That is the failure shape that
-- looks like health, and until this role existed the API had no alternative.
--
-- Created NOLOGIN and without a password on purpose: this file is public.
-- Credentials are granted locally by `pnpm db:reset` from APP_DATABASE_URL,
-- and in deployment by the Compose secret. Privileges live here because they
-- are part of the schema; credentials do not because they are not.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waltning_app') THEN
    CREATE ROLE waltning_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO waltning_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO waltning_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO waltning_app;
--> statement-breakpoint
-- Tables added by a later migration must be reachable without re-granting.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO waltning_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO waltning_app;
--> statement-breakpoint
-- The one thing it must NOT reach: the tax export view is the export role's
-- alone, and the app has no business reading a projection built for filing.
REVOKE ALL ON tax_ledger FROM waltning_app;
