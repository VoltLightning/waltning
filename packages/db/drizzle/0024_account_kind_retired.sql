-- ═══ WA021 — `loan_receivable` is retired for new accounts ═════════════════
--
-- Money a person owes you is a debt on that person (`SPEC.md` §6.6), never an
-- account: an account per borrower is the Money Manager encoding that could
-- not say what one person owes in each currency. The Money Manager import
-- converts those accounts into debts and archives them, and the kind is no
-- longer offered for a new account.
--
-- So an *active* `loan_receivable` account is refused as it is created or
-- brought back: inserted unarchived, switched to the kind, or unarchived
-- while holding it. An archived one — a converted account — still inserts,
-- because a device syncing down copies every row by insert. Existing rows are
-- left alone; a trigger checks the write, not the table.
CREATE OR REPLACE FUNCTION assert_account_kind_not_retired()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> 'loan_receivable' OR NEW.archived THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'loan_receivable' AND NOT OLD.archived THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'loan_receivable is retired: record money a person owes you as a debt on them (SPEC §6.6)'
    USING ERRCODE = 'WA021';
END $$;
--> statement-breakpoint
CREATE TRIGGER accounts_kind_not_retired
  BEFORE INSERT OR UPDATE OF kind, archived
  ON accounts
  FOR EACH ROW EXECUTE FUNCTION assert_account_kind_not_retired();
