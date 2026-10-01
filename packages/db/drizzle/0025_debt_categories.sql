-- ═══ WA022 — a debt category is a debt ═══════════════════════════════════════
--
-- `SPEC.md` §6.6. Four starter categories are debts — *Borrowed*, *Lent out*,
-- *Repayment received*, *Repayment made*, identified by their seed key
-- (`categories.external_id = 'seed:<key>'`, `@waltning/core/taxonomy`'s
-- `DEBT_SEED_KEYS`), never by name — and a row filed under one carries the
-- `debt` obligation role and a person on the other side.
--
-- **Backfill first, trigger second.** Rows already filed under the four that
-- name a person (`counterparty_id`) and carry no obligation become debts on
-- that person: the category says debt, the person is who it was with. Rows
-- with no person are left exactly as they are — nobody is guessed — as are rows
-- naming a company (a person's debt is what "names a person" means) and
-- soft-deleted rows. Rows `0022_identity_link` moved off the retired `reference`
-- role carry no mark, so they cannot be told from any other row that names a
-- person and are converted like it. The
-- trigger below does not reach them, because it watches the columns a debt is
-- made of (`category_id`, `obligation_role`, `obligation_counterparty_id`) and
-- an unrelated edit to such a row touches none of them. Idempotent: a second
-- run finds nothing left to convert.
UPDATE transactions t
SET    obligation_counterparty_id = t.counterparty_id,
       obligation_role            = 'debt'
WHERE  t.deleted_at IS NULL
  AND  t.counterparty_id IN (SELECT p.id FROM counterparties p WHERE p.kind = 'person')
  AND  t.obligation_counterparty_id IS NULL
  AND  t.obligation_role IS NULL
  AND  t.type IN ('income', 'expense')
  AND  t.category_id IN (
         SELECT c.id FROM categories c
         WHERE  c.external_id IN ('seed:borrowed', 'seed:lent-out',
                                  'seed:repayment-received', 'seed:repayment-made')
       );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_debt_category_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE  c.id = NEW.category_id
      AND  c.external_id IN ('seed:borrowed', 'seed:lent-out',
                             'seed:repayment-received', 'seed:repayment-made')
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.obligation_role IS NOT DISTINCT FROM 'debt'
     AND NEW.obligation_counterparty_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'a debt category needs the debt role and a person on the other side (SPEC §6.6)'
    USING ERRCODE = 'WA022',
          CONSTRAINT = 'transactions_debt_category_shape',
          TABLE = 'transactions',
          COLUMN = 'category_id';
END $$;
--> statement-breakpoint
CREATE TRIGGER transactions_debt_category_shape
  BEFORE INSERT OR UPDATE OF category_id, obligation_role, obligation_counterparty_id
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION assert_debt_category_shape();
--> statement-breakpoint
-- A split line carries no obligation of its own, so it is never filed under a
-- debt category: a debt is the whole transaction, with its person.
CREATE OR REPLACE FUNCTION assert_line_not_debt_category()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM categories c
    WHERE  c.id = NEW.category_id
      AND  c.external_id IN ('seed:borrowed', 'seed:lent-out',
                             'seed:repayment-received', 'seed:repayment-made')
  ) THEN
    RAISE EXCEPTION 'a split line cannot be filed under a debt category (SPEC §6.6)'
      USING ERRCODE = 'WA022',
            CONSTRAINT = 'transaction_lines_debt_category',
            TABLE = 'transaction_lines',
            COLUMN = 'category_id';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER transaction_lines_debt_category
  BEFORE INSERT OR UPDATE OF category_id
  ON transaction_lines
  FOR EACH ROW EXECUTE FUNCTION assert_line_not_debt_category();
