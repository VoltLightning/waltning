-- The closed-period guard checked one date; a move has two.
--
-- `0004` evaluated `coalesce(NEW.date, OLD.date)`. On UPDATE that is always
-- NEW.date, because `date` is NOT NULL — so the guard asked "is the row's
-- DESTINATION in a closed period?" and never "did it come out of one?"
--
-- Moving a filed transaction from February to June therefore succeeded. Nothing
-- was inserted, deleted or edited in the closed period by any reading the
-- trigger could take, and yet February's total silently dropped by the amount
-- of that row — after the period was filed against it. This is worse than the
-- backdating case the guard was written for: backdating shows up as a row you
-- did not expect, and a move shows up as nothing at all.
--
-- A move touches two periods. Both have to be open.
--
-- Second, worse defect in the same eight lines: it ended `RETURN NEW`, and in a
-- BEFORE DELETE trigger `NEW` is NULL. Returning NULL from a BEFORE trigger
-- cancels the operation — so **every** DELETE on `transactions` was silently
-- suppressed, in open periods as much as closed ones, and Postgres reported
-- `DELETE 0` as ordinary success rather than an error. A guard written to
-- refuse some deletes refused all of them, quietly. The row count is the only
-- thing that would have told you, and only if you looked.
--
-- Both defects were found by running the trigger, not by reading it. That is
-- the whole argument of `defects.md` arriving one layer down: the fix for
-- "asserting is not enforcing" is itself an assertion until it is executed.
CREATE OR REPLACE FUNCTION assert_period_not_closed()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d date;
BEGIN
  FOREACH d IN ARRAY (
    CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.date]
      WHEN 'DELETE' THEN ARRAY[OLD.date]
      ELSE ARRAY[OLD.date, NEW.date]   -- UPDATE: origin and destination
    END
  ) LOOP
    IF EXISTS (
      SELECT 1 FROM tax_period_locks l
      WHERE l.reopened_at IS NULL
        AND d BETWEEN l.period_start AND l.period_end
    ) THEN
      RAISE EXCEPTION
        'transaction dated % falls in a closed tax period — reopen it first (SPEC.md §13.4)', d
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;
