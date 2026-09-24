-- The four views that name the renamed columns, recreated.
--
-- **`ALTER TABLE … RENAME COLUMN` is not enough, and the reason is not
-- obvious.** Postgres rewrites a view's *references* when the column under it
-- is renamed, so every view here keeps working — but a view's **output**
-- column names are fixed when it is created and are never rewritten. So
-- `tax_ledger.payee` would still be called `payee` over a base column now
-- called `entered_name`, and `SELECT t.*` in `transactions_valued` was
-- expanded into a fixed list the day it was written, which means it carries
-- the old names too. `CREATE OR REPLACE VIEW` cannot rename an output column
-- either; only a drop and a create can.
--
-- **The grants are restated, because dropping a view drops its privileges
-- with it.** `0001`'s T1 argument is an *enumerated* denial — the set of
-- relations `waltning_export` may read must be exactly `{tax_ledger}` — and
-- `verify_t1()` asserts that set, so a recreated view that silently lost its
-- REVOKE would be caught there rather than here. Restating them keeps the
-- assertion answering a question about this migration rather than about the
-- one that created the role.
--
-- **`tax_ledger` still exports the *obligation* counterparty**, which is what
-- the column has always held; this migration renames it and changes nothing
-- about which link the export names. The identity link does not exist yet.

DROP VIEW tax_ledger;--> statement-breakpoint
DROP VIEW transactions_valued;--> statement-breakpoint

-- Identical to `0005_transactions_valued.sql`'s own definition, re-expanded
-- over the renamed columns. Not materialised, for the reason given there: the
-- most-read number in the system is the worst place for a staleness window.
CREATE VIEW transactions_valued AS
  SELECT t.*,
         t.amount_original * t.fx_rate AS amount_pivot,
         t.to_amount      * t.to_fx_rate AS to_amount_pivot
  FROM   transactions t;--> statement-breakpoint

REVOKE ALL ON transactions_valued FROM waltning_export;--> statement-breakpoint

-- Column list and predicates unchanged but for the two renamed names.
CREATE VIEW tax_ledger AS
  SELECT t.id, t.date, t.type, t.account_id, t.category_id,
         t.obligation_counterparty_id, t.counterparty_tax_id, t.document_ref, t.ksef_id,
         t.ryczalt_rate, t.ryczalt_activity,
         t.amount_original, t.currency, t.fx_rate, t.fx_rate_estimated,
         t.amount_pivot, t.entered_name, t.note,
         t.tax_fx_rate, t.tax_fx_date, t.tax_fx_source
  FROM   transactions_valued t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own';--> statement-breakpoint

GRANT SELECT ON tax_ledger TO waltning_export;--> statement-breakpoint
REVOKE ALL ON tax_ledger FROM waltning_app;--> statement-breakpoint

-- §13.1's two report views. Neither is granted to anybody: they are read on
-- the owner's connection, and `0001`'s default privileges revoke on creation.
DROP VIEW tax_omission_candidates;--> statement-breakpoint
CREATE VIEW tax_omission_candidates AS
  SELECT t.id, t.date, t.entered_name, t.amount_original, t.currency, t.obligation_counterparty_id
  FROM   transactions t
  JOIN   accounts a  ON a.id = t.account_id
  JOIN   categories c ON c.id = t.category_id
  WHERE  t.type = 'income'
    AND  c.is_earnings = true
    AND  a.ownership = 'own'
    AND  t.is_business = false
    AND  t.deleted_at IS NULL;--> statement-breakpoint

DROP VIEW tax_unvalued_revenue;--> statement-breakpoint
CREATE VIEW tax_unvalued_revenue AS
  SELECT t.id, t.date, t.entered_name, t.amount_original, t.currency
  FROM   transactions t
  JOIN   accounts a ON a.id = t.account_id
  WHERE  t.is_business = true
    AND  t.deleted_at IS NULL
    AND  a.ownership = 'own'
    AND  t.currency <> 'PLN'
    AND  t.tax_fx_rate IS NULL;
