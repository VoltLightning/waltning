ALTER TABLE "transactions" ADD COLUMN "paid_amount" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paid_currency" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_currency_currencies_code_fk" FOREIGN KEY ("paid_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_shape" CHECK (("transactions"."paid_amount" is null) = ("transactions"."paid_currency" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_distinct" CHECK ("transactions"."paid_currency" is null or "transactions"."paid_currency" <> "transactions"."currency");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_type" CHECK ("transactions"."paid_amount" is null or "transactions"."type" in ('income', 'expense'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_not_settlement" CHECK ("transactions"."paid_amount" is null or "transactions"."debt_amount" is null);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_amount_positive" CHECK ("transactions"."paid_amount" is null or "transactions"."paid_amount" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_amount_ceiling" CHECK (("transactions"."paid_amount" is null or abs("transactions"."paid_amount") < 1000000000));
--> statement-breakpoint
-- ═══ The scale guarantee for the paid figure, hand-written because drizzle-kit cannot emit a trigger ═══
--
-- `paid_amount` carries its own `paid_currency`, so a figure past that
-- currency's declared decimals is refused here — the same shape and SQLSTATE
-- (`WA016`) `assert_amount_scale` gives the account-side figure. A second
-- trigger beside it rather than an edit to its function, so the shipped step
-- stays what it was. `deleted_at` is in the column list for the reason the
-- older trigger gives: a restore re-fires the check.
CREATE OR REPLACE FUNCTION assert_paid_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  IF NEW.paid_amount IS NOT NULL AND NEW.paid_currency IS NOT NULL THEN
    SELECT decimals INTO allowed FROM currencies WHERE code = NEW.paid_currency;
    IF allowed IS NOT NULL AND scale(trim_scale(NEW.paid_amount)) > allowed THEN
      RAISE EXCEPTION
        'paid_amount % holds more decimal places than % allows (%) (H2)',
        trim_scale(NEW.paid_amount), NEW.paid_currency, allowed
        USING ERRCODE = 'WA016',
          CONSTRAINT = 'transactions_paid_scale_matches_currency',
          COLUMN = 'paid_amount';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_paid_scale_matches_currency
  BEFORE INSERT OR UPDATE OF paid_amount, paid_currency, deleted_at
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_paid_amount_scale();
--> statement-breakpoint
-- The other direction: a currency's `decimals` cannot be lowered while an
-- entry holds a paid figure past the narrower scale. A second trigger beside
-- `assert_currency_decimals_safe`, as `opening_debts` has.
CREATE OR REPLACE FUNCTION assert_currency_decimals_safe_paid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.decimals >= OLD.decimals THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM transactions
  WHERE paid_currency = NEW.code AND scale(trim_scale(paid_amount)) > NEW.decimals;
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % transaction row(s) hold a paid figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER currencies_decimals_safe_paid
  BEFORE UPDATE OF decimals ON currencies
  FOR EACH ROW EXECUTE FUNCTION assert_currency_decimals_safe_paid();
