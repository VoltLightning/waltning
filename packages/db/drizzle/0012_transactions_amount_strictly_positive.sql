-- M1 — `DROP CONSTRAINT IF EXISTS`: a rerun, or a database where 0000 never
-- created the old constraint under this exact name, must not fail here.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_amount_positive";--> statement-breakpoint
-- M1 — added `NOT VALID`. A preceding data-repair step is impossible to
-- write for a zero-amount row without inventing a figure nobody recorded, so
-- this tightens the CHECK for every new or updated row immediately while
-- grandfathering whatever the table already holds. A fresh install has no
-- rows yet, so `VALIDATE CONSTRAINT` on it succeeds instantly, whenever it is
-- run. On a database already holding a zero-amount, non-adjustment row, the
-- owner resolves those rows and then runs, once:
--   ALTER TABLE transactions VALIDATE CONSTRAINT transactions_amount_positive;
-- That step belongs to the owner, not to this migration.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_original" > 0 or "transactions"."type" = 'adjustment') NOT VALID;
