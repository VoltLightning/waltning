-- M1 — `ADD COLUMN` first, the rebuild second: drizzle-kit's own generated
-- ordering puts the `__new_fx_rates` rebuild first, with `displaced_rate`,
-- `displaced_source` and `displaced_fetched_at` baked into its `CREATE TABLE`
-- and its `INSERT … SELECT` reading all three off the *old* `fx_rates` —
-- which does not have them yet. Hand-ordered here, the same fix the previous
-- round of this migration made: the three columns are added to the live
-- table via plain `ALTER TABLE … ADD COLUMN` (SQLite needs no rebuild for a
-- nullable column), so by the time the rebuild's `SELECT` runs, `fx_rates`
-- already carries all nine columns it copies.
--
-- `fx_rates_rate_bounds`, baked into `__new_fx_rates` below, has a
-- hand-written companion: `migrate.ts`'s `REPLICA_BACKFILLS["0009_schema"]`
-- is a check-only hook (no `fill` — there is nothing here to derive) that
-- runs before this step's `INSERT … SELECT`, refuses by naming every
-- `fx_rates` row this `CHECK` would reject, and says how to recover (delete
-- or re-set the rate in S18) — because a rate a pre-bounds `change_pivot`
-- minted outside the bound would otherwise fail the `INSERT … SELECT`
-- itself, roll the whole step back, and repeat that same unexplained
-- failure on every later launch.
ALTER TABLE `fx_rates` ADD `displaced_rate` text;--> statement-breakpoint
ALTER TABLE `fx_rates` ADD `displaced_source` text;--> statement-breakpoint
ALTER TABLE `fx_rates` ADD `displaced_fetched_at` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_fx_rates` (
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`date` text NOT NULL,
	`rate` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer,
	`displaced_rate` text,
	`displaced_source` text,
	`displaced_fetched_at` integer,
	FOREIGN KEY (`base`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fx_rates_rate_bounds" CHECK(cast("__new_fx_rates"."rate" as real) > 0.000000000001 and cast("__new_fx_rates"."rate" as real) < 999999999999)
);
--> statement-breakpoint
INSERT INTO `__new_fx_rates`("base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at") SELECT "base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at" FROM `fx_rates`;--> statement-breakpoint
DROP TABLE `fx_rates`;--> statement-breakpoint
ALTER TABLE `__new_fx_rates` RENAME TO `fx_rates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_pk` ON `fx_rates` (`base`,`quote`,`date`);
--> statement-breakpoint
-- ═══ DESK3 review round 1, C2 layer 3 — the same guarantee Postgres's
-- WA017 (`assert_category_kind_matches_type`, `packages/db/drizzle/
-- 0011_transaction_scale_and_category_kind.sql`) already enforces, added
-- here under the disposable-until-first-install ruling: nothing has
-- installed this schema yet, so the head migration is still the file to
-- edit rather than a new one.
--
-- `categorize-batch.executor.ts`'s own `WHERE` clause already refuses a
-- kind mismatch with a real message; this is the backstop `CLAUDE.md` asks
-- for beside it — "holds when code is wrong," not the caller's own
-- good-error path. `create-transaction.executor.ts` and
-- `update-transaction.executor.ts` write a single row each and take the
-- same trigger for free.
--
-- Two triggers, not one: SQLite's `UPDATE OF <columns>` restricts which
-- column changes fire a trigger, but that clause does not exist for
-- `INSERT` — an inserted row has no "before" to name columns against — so
-- an insert-time check needs its own trigger, the only way SQLite's grammar
-- lets one mirror Postgres's single `BEFORE INSERT OR UPDATE OF
-- category_id, type`.
CREATE TRIGGER `transactions_category_kind_matches_type_insert`
BEFORE INSERT ON `transactions`
WHEN NEW.category_id IS NOT NULL
  AND NEW.type IN ('income', 'expense')
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NULL
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) <> NEW.type
BEGIN
  SELECT RAISE(ABORT, 'category kind does not match transaction type (WA017)');
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_category_kind_matches_type_update`
BEFORE UPDATE OF category_id, type ON `transactions`
WHEN NEW.category_id IS NOT NULL
  AND NEW.type IN ('income', 'expense')
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) IS NOT NULL
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) <> NEW.type
BEGIN
  SELECT RAISE(ABORT, 'category kind does not match transaction type (WA017)');
END;
