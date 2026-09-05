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
-- This step carries no `fill` and no `objects` — only that `check`, and no
-- trigger. Every hand-written replica trigger lives in the `objects` hook of
-- the last step that rebuilds `transactions` (`migrate.ts`'s
-- `REPLICA_BACKFILLS["0010_schema"].objects`), and the hook moves when that
-- step does.
--
-- Not because there is nowhere hand-written to put one: `drizzle/replica`
-- holds `0001_database_objects.sql` and `0011_dashboard_layout_seed.sql`, so
-- the slot exists. A step is the wrong home for a different reason. Its
-- statements are frozen by its checksum the moment an installed database has
-- run them, so the file cannot be edited later to put back a trigger a
-- rebuild dropped — and `0010_schema` rebuilds `transactions`
-- copy-rename-drop, which takes that table's triggers with it, so a trigger
-- created here would be deleted one step later. What re-creates it has to be
-- able to *move*, which is what a hook keyed by step tag is. And a generated
-- file cannot hold one at all: drizzle-kit regenerates this file and cannot
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
