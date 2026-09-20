ALTER TABLE "transactions" ADD COLUMN "time_of_day" time;--> statement-breakpoint

-- ═══ The minute is the resolution, and the column must say so ════════════
--
-- §7.0a: this records when in a day something happened, and nothing in this
-- ledger knows a second. Postgres `time` would accept `14:20:30` happily, and
-- a row carrying one would compare and sort differently from the same minute
-- written the way the app writes it — two spellings of one value, which is the
-- shape `AccountingDate` exists to prevent on the other column.
--
-- `TimeOfDay` narrows to `HH:MM` on the way in and out, so this is the floor
-- under that: it holds when the code is wrong, which is the only time a CHECK
-- earns its place.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_time_of_day_whole_minute"
  CHECK ("time_of_day" IS NULL OR date_part('second', "time_of_day") = 0);
