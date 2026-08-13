-- Three invariants a CHECK cannot express, because each spans two tables.
-- SPEC.md §6.5. Each one is a rule the design elsewhere claims as a guarantee,
-- which is the only reason a trigger is justified over application code.

-- 1 ── A transaction's currency is its account's currency.
--
-- §7.1 states that `amount_original` *is* denominated in the account's
-- currency. Nothing enforced it, so a USD amount could sit on a PLN account
-- and every balance, conversion and report downstream would be wrong while
-- looking entirely well-formed.
CREATE OR REPLACE FUNCTION assert_transaction_currency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_ccy text;
  target_ccy  text;
BEGIN
  SELECT currency INTO account_ccy FROM accounts WHERE id = NEW.account_id;
  IF NEW.currency <> account_ccy THEN
    RAISE EXCEPTION
      'transaction currency % does not match account currency % (account %)',
      NEW.currency, account_ccy, NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.to_account_id IS NOT NULL THEN
    SELECT currency INTO target_ccy FROM accounts WHERE id = NEW.to_account_id;
    IF NEW.to_currency <> target_ccy THEN
      RAISE EXCEPTION
        'transfer to_currency % does not match destination account currency % (account %)',
        NEW.to_currency, target_ccy, NEW.to_account_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER transactions_currency_matches_account
  BEFORE INSERT OR UPDATE OF account_id, currency, to_account_id, to_currency
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_currency();--> statement-breakpoint

-- 2 ── Only leaves are assignable.
--
-- TAXONOMY.md R1 — "a category is a group OR a leaf, never both" — is called
-- the single rule that eliminates faults 1, 2 and 3, and it is the exact
-- defect that left 705 transactions sitting on the `Food` parent in Money
-- Manager. It was stated everywhere and enforced nowhere.
CREATE OR REPLACE FUNCTION assert_category_is_leaf()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  leaf boolean;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_leaf INTO leaf FROM categories WHERE id = NEW.category_id;
  IF NOT leaf THEN
    RAISE EXCEPTION
      'category % is a group, not a leaf — only leaves are assignable (TAXONOMY.md R1)',
      NEW.category_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER transactions_category_is_leaf
  BEFORE INSERT OR UPDATE OF category_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_category_is_leaf();--> statement-breakpoint

CREATE TRIGGER transaction_lines_category_is_leaf
  BEFORE INSERT OR UPDATE OF category_id ON transaction_lines
  FOR EACH ROW EXECUTE FUNCTION assert_category_is_leaf();--> statement-breakpoint

-- A category cannot claim to be a leaf while holding children, nor become a
-- group while transactions still point at it. Without this, R1 holds only for
-- rows written after the parent was correctly flagged.
CREATE OR REPLACE FUNCTION assert_category_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_leaf AND EXISTS (
    SELECT 1 FROM categories WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'category % has children and cannot be a leaf', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT NEW.is_leaf AND EXISTS (
    SELECT 1 FROM transactions
    WHERE category_id = NEW.id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'category % still has transactions and cannot become a group', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A child must share its parent's kind: an income leaf under an expense
  -- group would be assignable from the wrong picker and would sum into the
  -- wrong side of every report.
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories p
    WHERE p.id = NEW.parent_id AND p.kind <> NEW.kind
  ) THEN
    RAISE EXCEPTION 'category % kind does not match its parent', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER categories_shape
  AFTER INSERT OR UPDATE OF is_leaf, parent_id, kind ON categories
  FOR EACH ROW EXECUTE FUNCTION assert_category_shape();--> statement-breakpoint

-- 3 ── Shared money is never business.
--
-- §6.7 says the combination "is invalid and constrained against", and
-- `accounts_shared_not_business` does constrain it — at the account level only.
-- A transaction carrying is_business = true in a jointly-owned account passed
-- every check and would reach `tax_ledger`: a hole in T1 (§13.1), the
-- guarantee the entire tax argument rests on.
CREATE OR REPLACE FUNCTION assert_business_not_shared()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_business AND EXISTS (
    SELECT 1 FROM accounts
    WHERE id = NEW.account_id AND ownership = 'shared'
  ) THEN
    RAISE EXCEPTION
      'a business transaction cannot sit in a shared account (SPEC.md §6.7, §13.1)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER transactions_business_not_shared
  BEFORE INSERT OR UPDATE OF is_business, account_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_business_not_shared();
