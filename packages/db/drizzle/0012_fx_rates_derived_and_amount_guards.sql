ALTER TYPE "public"."fx_source" ADD VALUE 'derived';--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_rate" numeric(24, 12);--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_source" "fx_source";--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_fetched_at" timestamp with time zone;--> statement-breakpoint
-- H2 — `fx_rates_rate_positive` says a rate is positive; this says it is
-- *usable*. A rate is crossed exactly once, at the write boundary
-- (`money.reciprocal`), and each bound here exists to make the far side of
-- that crossing storable: above `1e-12`, because `1 / 1e-12` is exactly
-- `1e12` and overflows `numeric(24,12)`; below `999999999999` — the type's
-- own largest integer part, not `1e12` itself, which is one digit past what
-- `numeric(24,12)` can even store and so overflows on write before this
-- CHECK ever runs, leaving a generic "numeric field overflow" as the only
-- error a caller sees instead of this constraint's own name — because past
-- the ceiling the flip truncates to `0.000000000000`, which `> 0` accepts —
-- the zero arrives from the far side of the crossing, where no CHECK was
-- looking. `money.ts`'s `RATE_MAX_EXCLUSIVE` carries the argument in full,
-- including why this is not the stronger "closed under the flip".
--
-- Same shape as `transactions_amount_positive` and
-- `transactions_fx_rate_positive` below: `NOT VALID` first, so a database
-- already holding an out-of-bounds rate is grandfathered rather than having
-- this migration abort on it, then a guarded `VALIDATE` that flips the
-- constraint to `VALID` immediately on a fresh install (dev, CI, a test run),
-- where there is nothing to violate it. `DROP CONSTRAINT IF EXISTS` so a
-- rerun, or a database where `0000` already created the name, does not fail.
ALTER TABLE "fx_rates" DROP CONSTRAINT IF EXISTS "fx_rates_rate_bounds";--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_rate_bounds" CHECK ("fx_rates"."rate" > 0.000000000001 and "fx_rates"."rate" < 999999999999) NOT VALID;--> statement-breakpoint
-- An existing database still holding an out-of-bounds rate is left `NOT
-- VALID` until its owner resolves those rows and runs, once:
--   ALTER TABLE fx_rates VALIDATE CONSTRAINT fx_rates_rate_bounds;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "fx_rates"
    WHERE NOT ("rate" > 0.000000000001 AND "rate" < 999999999999)
  ) THEN
    ALTER TABLE "fx_rates" VALIDATE CONSTRAINT "fx_rates_rate_bounds";
  END IF;
END $$;
--> statement-breakpoint
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
