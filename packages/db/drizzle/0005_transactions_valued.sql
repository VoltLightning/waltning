-- Generated (the two DROP COLUMNs) and then hand-extended, in that order —
-- because Postgres refuses to drop a column a view depends on, and `tax_ledger`
-- selects `amount_pivot`. Renamed from `0005_vengeful_firelord.sql`.
--
-- `architecture/14` §14.7: **Postgres adds power around the shared tables,
-- never inside them.** `amount_pivot` and `to_amount_pivot` were
-- `GENERATED ALWAYS ... STORED`, which SQLite has no equivalent for — so they
-- stop being stored and become columns on a view. The base table is then the
-- same concept on both engines, which is what lets `packages/schema` define it
-- once. `computations.md`'s formulae are unchanged; only where the
-- multiplication happens moved.

-- ═══ 1 ── the view must go before the columns it reads ═══════════════════
DROP VIEW IF EXISTS tax_ledger;--> statement-breakpoint

ALTER TABLE "transactions" DROP COLUMN "amount_pivot";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "to_amount_pivot";--> statement-breakpoint

-- ═══ 2 ── the valued view ════════════════════════════════════════════════
--
-- Not materialised. A stored generated column was consistent by construction;
-- a materialised view is consistent only as often as someone refreshes it, and
-- the most-read number in the system is the worst place to introduce a
-- staleness window. Postgres computes the product on read, which is what it did
-- before — the STORED keyword bought disk, not correctness.
CREATE VIEW transactions_valued AS
  SELECT t.*,
         t.amount_original * t.fx_rate AS amount_pivot,
         t.to_amount      * t.to_fx_rate AS to_amount_pivot
  FROM   transactions t;--> statement-breakpoint

-- **T1: the export role must not reach this.**
--
-- `transactions_valued` exposes every row in the ledger, business or not. The
-- default privileges below already revoke on new relations, so this is
-- belt-and-braces — but the enumerated denial is the style this file uses
-- deliberately, because a reader must be able to see the intent without
-- knowing what `ALTER DEFAULT PRIVILEGES` did three hundred lines earlier.
REVOKE ALL ON transactions_valued FROM waltning_export;--> statement-breakpoint

-- ═══ 3 ── the tax view, reading the valued one ═══════════════════════════
--
-- Column list and predicates unchanged. The three predicates are the whole of
-- T1's filtering and are re-stated here rather than inherited, because a view's
-- column list is fixed at creation and this one is recreated, not altered.
CREATE VIEW tax_ledger AS
  SELECT t.id, t.date, t.type, t.account_id, t.category_id,
         t.counterparty_id, t.counterparty_tax_id, t.document_ref, t.ksef_id,
         t.ryczalt_rate, t.ryczalt_activity,
         t.amount_original, t.currency, t.fx_rate, t.fx_rate_estimated,
         t.amount_pivot, t.payee, t.note,
         t.tax_fx_rate, t.tax_fx_date, t.tax_fx_source
  FROM   transactions_valued t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own';--> statement-breakpoint

GRANT SELECT ON tax_ledger TO waltning_export;--> statement-breakpoint

-- ═══ 4 ── `verify_t1()` was narrower than the guarantee it names ═════════
--
-- Check (b) asserted only that `waltning_export` cannot SELECT the **base
-- table**. It said nothing about any *other* relation exposing the same rows —
-- so the view added above would have passed it while handing the export role a
-- complete, unfiltered ledger, had the REVOKE been forgotten.
--
-- That is not hypothetical: adding `transactions_valued` is the first new view
-- over `transactions` since T1 was written, and it walked straight into the gap.
--
-- The check is now an **enumeration**: the set of relations the role may read
-- must be exactly `{tax_ledger}`. That survives the next view somebody adds,
-- which the old form did not.
CREATE OR REPLACE FUNCTION verify_t1()
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql AS $$
DECLARE
  defn text;
  n_view bigint;
  n_base bigint;
  readable text[];
BEGIN
  -- (a) the view is what we think it is
  SELECT pg_get_viewdef('tax_ledger'::regclass, true) INTO defn;
  RETURN QUERY SELECT
    'view_definition_pinned',
    defn LIKE '%is_business%' AND defn LIKE '%deleted_at%' AND defn LIKE '%ownership%',
    'view must filter is_business, deleted_at and ownership';

  -- (b) the role can read exactly one relation, and it is the tax view
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), '{}')
    INTO readable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
     AND has_table_privilege('waltning_export', c.oid, 'SELECT');
  RETURN QUERY SELECT
    'export_role_reads_only_tax_ledger',
    readable = ARRAY['tax_ledger'],
    format('waltning_export can read %s (want exactly {tax_ledger})', readable);

  -- (c) the counts agree, computed from BOTH sides
  SELECT count(*) INTO n_view FROM tax_ledger;
  SELECT count(*) INTO n_base FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.is_business AND t.deleted_at IS NULL AND a.ownership = 'own';
  RETURN QUERY SELECT
    'view_matches_base_predicate',
    n_view = n_base,
    format('view %s vs base %s', n_view, n_base);
END $$;
