-- ═══ WA022 — an account something references is archived, never deleted ════
--
-- `SPEC.md` §6.9: reference data is archived, never deleted — except an account
-- **no row has ever referenced**, which `delete_account` may remove. Anything
-- that has touched the account keeps it: a transaction on either leg
-- (soft-deleted ones too — they are still rows, and the audit trail names
-- them), a recurring rule, an import batch, or a non-zero opening balance,
-- which is money the account started with and would leave every total
-- silently if the row went.
--
-- The foreign keys already refuse the first three, with `23503` and no name
-- for the rule. This is the rule, in the domain's own code, and the fourth
-- reference no foreign key can see. It is a BEFORE trigger so it runs ahead of
-- the foreign key and the client gets WA022 rather than a constraint name
-- nobody reads.
CREATE OR REPLACE FUNCTION assert_account_deletable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM transactions WHERE account_id = OLD.id OR to_account_id = OLD.id
     )
     OR EXISTS (
       SELECT 1 FROM recurring_transactions WHERE account_id = OLD.id OR to_account_id = OLD.id
     )
     OR EXISTS (SELECT 1 FROM import_batches WHERE account_id = OLD.id)
     OR OLD.opening_balance <> 0
  THEN
    RAISE EXCEPTION
      'account % is referenced and cannot be deleted — archive it instead (SPEC.md §6.9)', OLD.id
      USING ERRCODE = 'WA022';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounts_delete_guard
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION assert_account_deletable();
--> statement-breakpoint
-- ═══ The amount ceiling ════════════════════════════════════════════════════
--
-- No amount a row holds reaches 1 000 000 000 in absolute value
-- (`money.ts`'s `AMOUNT_CEILING_EXCLUSIVE`; 999 999 999.99 at two decimals,
-- and the same integer bound for a currency with other decimals). One CHECK
-- per table, covering every amount column it carries.
--
-- Added `NOT VALID`, the shape `transactions_amount_positive` and
-- `fx_rates_rate_bounds` already take: the rule binds every new or updated row
-- immediately, and a database that already holds a figure past it — a typo
-- that was accepted before this rule existed — is grandfathered rather than
-- having this migration abort on it. A fresh install has nothing to violate
-- it, so the guarded `VALIDATE` below flips each to `VALID` at once. On a
-- database that does hold one, find it with:
--   SELECT id FROM transactions WHERE abs(amount_original) >= 1000000000
--     OR abs(to_amount) >= 1000000000 OR abs(fee) >= 1000000000
--     OR abs(debt_amount) >= 1000000000;
-- correct the rows, then run, once, for each constraint left NOT VALID:
--   ALTER TABLE <table> VALIDATE CONSTRAINT <name>;
-- That step belongs to the owner, not to this migration.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opening_balance_ceiling" CHECK (("accounts"."opening_balance" is null or abs("accounts"."opening_balance") < 1000000000)) NOT VALID;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_amount_ceiling" CHECK (("recurring_transactions"."amount_original" is null or abs("recurring_transactions"."amount_original") < 1000000000)) NOT VALID;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_amount_ceiling" CHECK (("transaction_lines"."amount" is null or abs("transaction_lines"."amount") < 1000000000)) NOT VALID;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_ceiling" CHECK (("transactions"."amount_original" is null or abs("transactions"."amount_original") < 1000000000) and ("transactions"."to_amount" is null or abs("transactions"."to_amount") < 1000000000) and ("transactions"."fee" is null or abs("transactions"."fee") < 1000000000) and ("transactions"."debt_amount" is null or abs("transactions"."debt_amount") < 1000000000)) NOT VALID;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "accounts" WHERE abs("opening_balance") >= 1000000000) THEN
    ALTER TABLE "accounts" VALIDATE CONSTRAINT "accounts_opening_balance_ceiling";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "recurring_transactions" WHERE abs("amount_original") >= 1000000000) THEN
    ALTER TABLE "recurring_transactions" VALIDATE CONSTRAINT "recurring_transactions_amount_ceiling";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "transaction_lines" WHERE abs("amount") >= 1000000000) THEN
    ALTER TABLE "transaction_lines" VALIDATE CONSTRAINT "transaction_lines_amount_ceiling";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "transactions"
    WHERE abs("amount_original") >= 1000000000
       OR abs("to_amount") >= 1000000000
       OR abs("fee") >= 1000000000
       OR abs("debt_amount") >= 1000000000
  ) THEN
    ALTER TABLE "transactions" VALIDATE CONSTRAINT "transactions_amount_ceiling";
  END IF;
END $$;
