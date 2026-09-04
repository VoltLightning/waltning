-- M5 — a same-currency transfer written while `transactions_to_amount_positive`
-- still read `>= 0` could carry `to_amount = 0` (S31 §3 states `to_amount`
-- equals `amount_original` for that shape; `>= 0` never enforced it). Before
-- either CHECK below goes on, repair those rows in place — `to_amount` set
-- back to `amount_original`, its own correct value — rather than leave them
-- to violate the new CHECK the moment this migration finishes.
UPDATE "transactions"
SET "to_amount" = "amount_original"
WHERE "type" = 'transfer'
  AND "to_amount" = 0
  AND "to_currency" = "currency";
--> statement-breakpoint
-- `IF EXISTS` — `transactions_to_amount_positive` already exists from
-- `0008` on any database that ran it under its old number; a fresh database
-- applying this migration alone has never created it. Either way this drops
-- cleanly and the `ADD CONSTRAINT` below is the one truth.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_to_amount_positive";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_amount_positive" CHECK ("transactions"."to_amount" is null or "transactions"."to_amount" > 0);--> statement-breakpoint
-- M1 — a `fee` column written while `transactions_fee_positive` did not
-- exist could carry `0` instead of `NULL` ("no fee" is the app's own
-- contract, never the database's to infer). Repair those rows in place
-- before the CHECK below goes on, the same way the `to_amount` repair above
-- does — rather than leave every zero-fee row to violate the new CHECK the
-- moment this migration finishes.
--
-- Left unrepaired, on purpose: a same-currency transfer whose
-- `amount_original` is itself `0`, and a cross-currency transfer whose
-- `to_amount` is `0` (`0008`'s own `>= 0` era never forbade either). Both
-- are invented figures — there is no other value in the row to repair them
-- from — so they are left to fail this migration loudly rather than have a
-- wrong number picked for them silently. Find them first with:
--   SELECT id FROM transactions WHERE type = 'transfer'
--     AND ((to_currency = currency AND amount_original = 0)
--       OR (to_currency <> currency AND to_amount = 0));
UPDATE "transactions"
SET "fee" = NULL
WHERE "fee" IS NOT NULL AND "fee" <= 0;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_positive";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_positive" CHECK ("transactions"."fee" is null or "transactions"."fee" > 0);
