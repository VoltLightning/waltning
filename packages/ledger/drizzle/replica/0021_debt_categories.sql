-- Hand-written, `0011_dashboard_layout_seed.sql`'s precedent: rows, not schema.
-- The same backfill `packages/db/drizzle/0025_debt_categories.sql` runs on
-- Postgres (`SPEC.md` §6.6): a row filed under one of the four debt categories
-- (`seed:borrowed`, `seed:lent-out`, `seed:repayment-received`,
-- `seed:repayment-made` — by tag, never by name) that names a person
-- (`counterparty_id`) and carries no obligation becomes a debt on that person.
-- Rows that name nobody are left as they are. Idempotent: a second run finds
-- nothing to convert.
--
-- The trigger that holds the rule afterwards is not here: a hand-written replica
-- trigger is created by `migrate.ts`'s `objects` hook on this step
-- (`DEBT_CATEGORY_TRIGGERS`), so that it moves with the step that last rebuilds
-- `transactions` rather than being dropped, silently, by the next rebuild.
UPDATE `transactions`
SET `obligation_counterparty_id` = `counterparty_id`, `obligation_role` = 'debt'
WHERE `counterparty_id` IS NOT NULL
  AND `obligation_counterparty_id` IS NULL
  AND `obligation_role` IS NULL
  AND `type` IN ('income', 'expense')
  AND `category_id` IN (
    SELECT `id` FROM `categories`
    WHERE `external_id` IN ('seed:borrowed', 'seed:lent-out', 'seed:repayment-received', 'seed:repayment-made')
  );
