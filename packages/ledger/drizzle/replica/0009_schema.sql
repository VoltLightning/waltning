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
-- H1a — an archived category is not assignable, the replica's own half of
-- `0001_database_objects.sql`'s `assert_category_not_archived`.
--
-- **Both tables that carry a `category_id`**, because the server guards both:
-- `transaction_lines` holds §10.3's split, and a retired leaf on a line is the
-- copy nobody sees — the parent row shows a category the reader recognises
-- while the line beneath it points at one no picker offers.
--
-- `architecture/14` §14.6: the phone refuses at capture time what the server
-- would refuse. The client refuses this before the write
-- (`transactions.categoryUnavailable`) and the local executor refuses it again
-- (`assertCategoryNotArchived`) — neither is a guarantee, and this file is
-- where the replica's guarantees live. SQLite has no cross-table CHECK, so a
-- trigger is the only shape available; two of them, because SQLite's
-- `BEFORE UPDATE OF` cannot name a column list the way Postgres can, so the
-- update half guards itself with a `WHEN` on the column actually moving.
--
-- Hand-written into the head migration rather than added as `0010`: every
-- current database is disposable until first install (`architecture/08` item
-- 1), so there is no installed chain to append to — and a new step would need
-- a fixture for the version it left behind, dumped from a database nobody has.
-- Once a build ships, this stops being true and a change here becomes a new
-- step.
--
-- Archiving a category that already holds rows stays legal: the triggers are
-- on the rows that point at a category, fired by the write that would newly
-- do so — never on `categories` itself.
CREATE TRIGGER `transactions_category_not_archived_insert`
BEFORE INSERT ON `transactions`
FOR EACH ROW WHEN NEW.`category_id` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM `categories`
		WHERE `categories`.`id` = NEW.`category_id` AND `categories`.`archived` = 1
	);
END;--> statement-breakpoint
CREATE TRIGGER `transactions_category_not_archived_update`
BEFORE UPDATE ON `transactions`
FOR EACH ROW WHEN NEW.`category_id` IS NOT NULL
	AND (OLD.`category_id` IS NULL OR OLD.`category_id` <> NEW.`category_id`)
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM `categories`
		WHERE `categories`.`id` = NEW.`category_id` AND `categories`.`archived` = 1
	);
END;--> statement-breakpoint
CREATE TRIGGER `transaction_lines_category_not_archived_insert`
BEFORE INSERT ON `transaction_lines`
FOR EACH ROW WHEN NEW.`category_id` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM `categories`
		WHERE `categories`.`id` = NEW.`category_id` AND `categories`.`archived` = 1
	);
END;--> statement-breakpoint
CREATE TRIGGER `transaction_lines_category_not_archived_update`
BEFORE UPDATE ON `transaction_lines`
FOR EACH ROW WHEN NEW.`category_id` IS NOT NULL
	AND (OLD.`category_id` IS NULL OR OLD.`category_id` <> NEW.`category_id`)
BEGIN
	SELECT RAISE(ABORT, 'category is archived — an archived category is not assignable (H1a)')
	WHERE EXISTS (
		SELECT 1 FROM `categories`
		WHERE `categories`.`id` = NEW.`category_id` AND `categories`.`archived` = 1
	);
END;