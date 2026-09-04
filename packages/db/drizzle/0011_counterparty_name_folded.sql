-- R2 C1/M3/H2 — `counterparties_name_uq` moves from `lower(btrim(name))` to
-- `name_folded` (case-fold plus the nine Polish diacritics), the same
-- normalisation the SQLite replica now indexes.
--
-- `GENERATED ALWAYS AS (…) STORED`, not app-written and backfilled (R2 H2):
-- a plain column here relied on every writer remembering to set it, and a
-- raw insert that skipped it — or supplied a stale one — wrote straight past
-- the index this migration builds. Postgres computes and stores it for every
-- existing row as part of `ADD COLUMN`, so there is no separate backfill
-- step here the way there would be for an ordinary column. `lower()`,
-- `translate()`, `btrim()` and `normalize()` on `text` are IMMUTABLE under
-- this database's collation (`docker-compose.yml`'s `--icu-locale=und-x-icu`)
-- — checked directly against a live instance before committing to this over
-- a `BEFORE INSERT OR UPDATE` trigger.
--
-- R2 H1 — `normalize(…, NFC)` first: without it this expression folds
-- without normalising, so an NFD name (`o` plus a combining acute, the form
-- some IMEs and iOS's own text fields produce) is admitted here while
-- `@waltning/core/capture/names`'s `fold()` — which normalises to NFC before
-- anything else — refuses the identical name on the phone. `normalize()` has
-- been IMMUTABLE on `text` since Postgres 13.
ALTER TABLE "counterparties" ADD COLUMN "name_folded" text GENERATED ALWAYS AS (lower(translate(normalize(btrim("name"), NFC), 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz'))) STORED NOT NULL;--> statement-breakpoint
DROP INDEX "counterparties_name_uq";--> statement-breakpoint
-- R2 M2 — without this, two counterparties that already fold to the same
-- value abort the `CREATE UNIQUE INDEX` below with a bare "could not create
-- unique index — key already exists", naming neither row. This names both,
-- before the index ever gets a chance to fail, so the owner can merge them
-- (S15 §9.2) and simply retry the migration.
DO $$
DECLARE
  msg text;
BEGIN
  SELECT string_agg(pair, '; ')
  INTO msg
  FROM (
    SELECT "name_folded" || ': ' || string_agg("id"::text, ', ' ORDER BY "id") AS pair
    FROM "counterparties"
    WHERE NOT "archived"
    GROUP BY "name_folded"
    HAVING count(*) > 1
  ) collisions;

  IF msg IS NOT NULL THEN
    RAISE EXCEPTION 'counterparties_name_uq: colliding once folded — %; merge them first (S15 §9.2), then retry this migration', msg;
  END IF;
END $$;--> statement-breakpoint
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
