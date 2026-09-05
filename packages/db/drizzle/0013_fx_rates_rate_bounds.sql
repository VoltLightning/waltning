-- H2 — `fx_rates_rate_positive` says a rate is positive; this says it is
-- *usable*. A rate is crossed exactly once, at the write boundary
-- (`money.reciprocal`), and each bound here exists to make the far side of
-- that crossing storable: above `1e-12`, because `1 / 1e-12` is exactly
-- `1e12` and overflows `numeric(24,12)`; below `1e12`, because past that the
-- flip truncates to `0.000000000000`, which `> 0` accepts — the zero arrives
-- from the far side of the crossing, where no CHECK was looking.
-- `money.ts`'s `RATE_MIN_EXCLUSIVE` carries the argument in full, including
-- why this is not the stronger "closed under the flip".
--
-- Same shape as `transactions_amount_positive` and
-- `transactions_fx_rate_positive` before it: `NOT VALID` first, so a database
-- already holding an out-of-bounds rate is grandfathered rather than having
-- this migration abort on it, then a guarded `VALIDATE` that flips the
-- constraint to `VALID` immediately on a fresh install (dev, CI, a test run),
-- where there is nothing to violate it. `DROP CONSTRAINT IF EXISTS` so a
-- rerun, or a database where `0000` already created the name, does not fail.
ALTER TABLE "fx_rates" DROP CONSTRAINT IF EXISTS "fx_rates_rate_bounds";--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_rate_bounds" CHECK ("fx_rates"."rate" > 0.000000000001 and "fx_rates"."rate" < 1000000000000) NOT VALID;--> statement-breakpoint
-- An existing database still holding an out-of-bounds rate is left `NOT
-- VALID` until its owner resolves those rows and runs, once:
--   ALTER TABLE fx_rates VALIDATE CONSTRAINT fx_rates_rate_bounds;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "fx_rates"
    WHERE NOT ("rate" > 0.000000000001 AND "rate" < 1000000000000)
  ) THEN
    ALTER TABLE "fx_rates" VALIDATE CONSTRAINT "fx_rates_rate_bounds";
  END IF;
END $$;
