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
    AND  a.ownership = 'own';--> statement-breakpoint

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
END $$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO waltning_export;--> statement-breakpoint
GRANT SELECT ON tax_ledger TO waltning_export;--> statement-breakpoint

REVOKE ALL ON transactions        FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON transaction_lines   FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON receipts            FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON import_rows         FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON agent_tool_calls    FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON agent_messages      FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON agent_memory        FROM waltning_export;--> statement-breakpoint
REVOKE ALL ON audit_log           FROM waltning_export;--> statement-breakpoint

-- Nothing added later is readable by accident.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM waltning_export;--> statement-breakpoint

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
    AND  t.deleted_at IS NULL;--> statement-breakpoint

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
END $$;--> statement-breakpoint

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
