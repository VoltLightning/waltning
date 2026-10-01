CREATE TABLE "opening_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"date" date NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_debts_amount_positive" CHECK ("opening_debts"."amount" > 0),
	CONSTRAINT "opening_debts_amount_ceiling" CHECK (("opening_debts"."amount" is null or abs("opening_debts"."amount") < 1000000000)),
	CONSTRAINT "opening_debts_direction_known" CHECK ("opening_debts"."direction" in ('theyOwe', 'youOwe'))
);
--> statement-breakpoint
ALTER TABLE "counterparty_merges" ADD COLUMN "moved_opening_debts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "settles_opening_debt_id" uuid;--> statement-breakpoint
ALTER TABLE "opening_debts" ADD CONSTRAINT "opening_debts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_debts" ADD CONSTRAINT "opening_debts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opening_debts_counterparty_currency_uq" ON "opening_debts" USING btree ("counterparty_id","currency") WHERE "opening_debts"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settles_opening_debt_id_opening_debts_id_fk" FOREIGN KEY ("settles_opening_debt_id") REFERENCES "public"."opening_debts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_opening_debt_idx" ON "transactions" USING btree ("settles_opening_debt_id") WHERE "transactions"."settles_opening_debt_id" is not null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_opening_link_shape" CHECK ("transactions"."settles_opening_debt_id" is null or coalesce("transactions"."obligation_role" = 'debt', false));
--> statement-breakpoint
-- ═══ The scale guarantee, hand-written because drizzle-kit cannot emit a trigger ═══
--
-- `opening_debts.amount` carries its own `currency`, so a figure past that
-- currency's declared decimals is refused here, the same shape and SQLSTATE
-- (`WA016`) `debt_reassignments` has — CHECKs bound the number, this bounds
-- the precision against a second table's row. A soft-deleted row is checked
-- like any other: a restore writes the past, and the past must still fit.
CREATE OR REPLACE FUNCTION assert_opening_debt_amount_scale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
BEGIN
  SELECT decimals INTO allowed FROM currencies WHERE code = NEW.currency;
  IF allowed IS NOT NULL AND scale(trim_scale(NEW.amount)) > allowed THEN
    RAISE EXCEPTION
      'amount % holds more decimal places than % allows (%) (H2)',
      trim_scale(NEW.amount), NEW.currency, allowed
      USING ERRCODE = 'WA016',
        CONSTRAINT = 'opening_debts_amount_scale_matches_currency',
        COLUMN = 'amount';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER opening_debts_amount_scale_matches_currency
  BEFORE INSERT OR UPDATE OF amount, currency
  ON opening_debts
  FOR EACH ROW EXECUTE FUNCTION assert_opening_debt_amount_scale();
--> statement-breakpoint
-- The other direction, as `assert_currency_decimals_safe` does for every older
-- table: a currency's `decimals` cannot be lowered while an opening debt holds
-- a figure past the narrower scale. A second trigger beside it, not an edit to
-- its function, so the shipped step stays what it was.
CREATE OR REPLACE FUNCTION assert_currency_decimals_safe_opening_debts()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.decimals >= OLD.decimals THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM opening_debts
  WHERE currency = NEW.code AND scale(trim_scale(amount)) > NEW.decimals;
  IF n > 0 THEN
    RAISE EXCEPTION
      'cannot lower % to % decimal places — % opening debt(s) hold a figure with more (C1)',
      NEW.code, NEW.decimals, n
      USING ERRCODE = 'WA018', CONSTRAINT = 'currencies_decimals_safe', COLUMN = 'decimals';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER currencies_decimals_safe_opening_debts
  BEFORE UPDATE OF decimals ON currencies
  FOR EACH ROW EXECUTE FUNCTION assert_currency_decimals_safe_opening_debts();
--> statement-breakpoint
-- `updated_at` moves on every update, the way `debt_reassignments` does; no
-- version, because a row is replaced whole and the phone's executor is the
-- only writer arbitrating it.
CREATE TRIGGER opening_debts_touch
  BEFORE UPDATE ON opening_debts
  FOR EACH ROW EXECUTE FUNCTION touch_row();
