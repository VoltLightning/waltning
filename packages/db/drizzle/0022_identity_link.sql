-- §6.6.1 — the identity link, and the end of the `reference` role.
--
-- A transaction can involve two counterparties at once: the one it was *with*
-- and the one it creates an obligation with. `counterparty_id` is the first,
-- and it is what `reference` was always trying to say through the second.
--
-- **The generator's own order cannot stand, and the reason is not cosmetic.**
-- `drizzle-kit` recreates the enum type first and casts the column with
-- `USING obligation_role::obligation_role` — against a table that still holds
-- rows saying `'reference'`, which the new type does not have. The cast fails
-- with *invalid input value for enum*, the migration rolls back, and it does
-- so only on a database that has such a row: green on an empty one, and on
-- every developer machine seeded after the role was already unused.
--
-- So the column arrives first, the rows move onto it, and the type is
-- narrowed last, when nothing is left that the narrower type cannot hold.
--
-- **And the narrowing needs `transactions_valued` out of the way.** Postgres
-- refuses to alter the type of a column a view reads, and that view is
-- `SELECT t.*`, so it reads every column including this one; `tax_ledger`
-- then reads it in turn. Both are dropped and restated here, with the grants
-- a `DROP VIEW` takes with it — the same argument `0019_obligation_views.sql`
-- makes at length, for the same two views.
-- `packages/ledger/src/migrate.ts`'s `REPLICA_BACKFILLS["0019_schema"].fill`
-- is the phone's half, stating the identical two updates.

ALTER TABLE "transactions" ADD COLUMN "counterparty_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_counterparty_idx" ON "transactions" USING btree ("counterparty_id");--> statement-breakpoint

-- Two statements, in this order: the copy has to land before the pair is
-- cleared, or the value it copies from is already gone.
UPDATE "transactions"
   SET "counterparty_id" = "obligation_counterparty_id"
 WHERE "obligation_role" = 'reference'
   AND "counterparty_id" IS NULL;--> statement-breakpoint

UPDATE "transactions"
   SET "obligation_counterparty_id" = NULL,
       "obligation_role" = NULL
 WHERE "obligation_role" = 'reference';--> statement-breakpoint

DROP VIEW tax_ledger;--> statement-breakpoint
DROP VIEW transactions_valued;--> statement-breakpoint

ALTER TABLE "transactions" ALTER COLUMN "obligation_role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."obligation_role";--> statement-breakpoint
CREATE TYPE "public"."obligation_role" AS ENUM('debt', 'contribution');--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "obligation_role" SET DATA TYPE "public"."obligation_role" USING "obligation_role"::"public"."obligation_role";--> statement-breakpoint

CREATE VIEW transactions_valued AS
  SELECT t.*,
         t.amount_original * t.fx_rate AS amount_pivot,
         t.to_amount      * t.to_fx_rate AS to_amount_pivot
  FROM   transactions t;--> statement-breakpoint

REVOKE ALL ON transactions_valued FROM waltning_export;--> statement-breakpoint

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
REVOKE ALL ON tax_ledger FROM waltning_app;
