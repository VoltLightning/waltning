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
-- hand-written companion: `migrate.ts`'s `REPLICA_BACKFILLS["0009_schema"]`.
-- Its `check` runs before this step's `INSERT … SELECT`, refuses by naming
-- every `fx_rates` row this `CHECK` would reject, and says how to recover
-- (delete or re-set the rate in S18) — because a rate a pre-bounds
-- `change_pivot` minted outside the bound would otherwise fail the
-- `INSERT … SELECT` itself, roll the whole step back, and repeat that same
-- unexplained failure on every later launch.
--
-- Its `fill` creates the two `transactions_category_kind_matches_type`
-- triggers (DESK3 round 1 C2 layer 3; moved there in round 2, L8). They are
-- SQL this file cannot hold: drizzle-kit regenerates this file and cannot
-- emit a trigger, so one written here would vanish on the next `pnpm
-- ledger:generate` without a single test going red.
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
