-- R2 C1/M3 — `counterparties_name_uq` moves from `lower(btrim(name))` to a
-- stored `name_folded` (written by the operation, `fold()` —
-- case-fold plus the nine Polish diacritics), the same normalisation the
-- SQLite replica now indexes. Nullable first, backfilled, then constrained:
-- an existing row has no folded value yet, and `ADD COLUMN … NOT NULL` with
-- no default fails outright on a non-empty table.
ALTER TABLE "counterparties" ADD COLUMN "name_folded" text;--> statement-breakpoint
UPDATE "counterparties" SET "name_folded" =
	lower(translate(btrim("name"), 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz'));--> statement-breakpoint
ALTER TABLE "counterparties" ALTER COLUMN "name_folded" SET NOT NULL;--> statement-breakpoint
DROP INDEX "counterparties_name_uq";--> statement-breakpoint
-- Partial (R2 M3): an archived counterparty's old name is free for a fresh
-- one to take; history stays under the archived row regardless (§9.2).
CREATE UNIQUE INDEX "counterparties_name_uq" ON "counterparties" USING btree ("name_folded") WHERE not "counterparties"."archived";--> statement-breakpoint
-- R2 H2 — a counterparty cannot be the loser of two open merges at once; the
-- other half of "a chained merge reverses into the wrong owner" is the
-- executor's own pre-check, which this index alone cannot express.
CREATE UNIQUE INDEX "counterparty_merges_loser_open_uq" ON "counterparty_merges" USING btree ("loser_id") WHERE "counterparty_merges"."unmerged_at" is null;--> statement-breakpoint
-- R2 M2 — the executor's own `mergeCounterpartiesInput` refine already
-- refuses this; the CHECK holds regardless of the caller.
ALTER TABLE "counterparty_merges" ADD CONSTRAINT "counterparty_merges_winner_ne_loser" CHECK ("counterparty_merges"."winner_id" <> "counterparty_merges"."loser_id");
