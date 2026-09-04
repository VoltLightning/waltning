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
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_original" > 0 or "transactions"."type" = 'adjustment') NOT VALID;--> statement-breakpoint
-- L3 — the fresh-install path validates itself. A brand-new database (dev,
-- CI, a test run) has no rows to violate this, so there is no reason to
-- leave it `NOT VALID` there too — the guard re-runs the same scan the
-- comment above asks the owner to run by hand, and only flips the
-- constraint to `VALID` when it finds nothing. An existing database still
-- holding a violating row is left exactly as the comment above describes:
-- `NOT VALID`, until the owner resolves those rows and validates it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "transactions"
    WHERE NOT ("amount_original" > 0 OR "type" = 'adjustment')
  ) THEN
    ALTER TABLE "transactions" VALIDATE CONSTRAINT "transactions_amount_positive";
  END IF;
END $$;
--> statement-breakpoint
-- L3 — the CHECK above justifies itself by naming `fx_rate` in
-- `amount_pivot = amount_original × fx_rate`, but nothing enforced `fx_rate`
-- itself. Same shape as the amount CHECK above: `NOT VALID` first so an
-- existing zero (`fx_rates.rate` has always refused one; `transactions` never
-- did) is grandfathered rather than aborting the migration, then a guarded
-- `VALIDATE` that flips it to `VALID` immediately on a fresh install.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fx_rate_positive";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fx_rate_positive" CHECK ("transactions"."fx_rate" is null or "transactions"."fx_rate" > 0) NOT VALID;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "transactions"
    WHERE NOT ("fx_rate" is null or "fx_rate" > 0)
  ) THEN
    ALTER TABLE "transactions" VALIDATE CONSTRAINT "transactions_fx_rate_positive";
  END IF;
END $$;
