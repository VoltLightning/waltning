-- `SPEC.md` §14.4b — a transaction (and a recurring rule) may carry a
-- Waltning-owned brand key, plus the shared `brand_aliases` reference table
-- the bundled catalogue bootstraps into
-- (`packages/db/src/seed/brand-aliases.ts`). Both new columns are nullable
-- and default to NULL on every existing row, so `*_brand_shape`'s "both
-- null, or both set" holds for the whole table with nothing to repair — no
-- `NOT VALID` dance is needed here, unlike `0011`/`0012`'s tightened numeric
-- CHECKs.
--
-- **Both tables are rebuilt, not altered.** SQLite has no `ALTER TABLE …
-- ADD CONSTRAINT`, so a bare `ADD COLUMN` would ship the two columns with
-- nothing enforcing their pairing while Postgres refused the same row —
-- §14.4b names no engine exception, and `architecture/14` §14.6 requires the
-- phone to refuse at capture time what the server would refuse. Both tables
-- therefore take the copy-rename-drop rebuild, carrying the identical CHECK.
--
-- **`brand_source` has three values.** `'none'` is a *deliberate* "no brand"
-- (a cleared catalogue match), distinct from `NULL`/`NULL` (never matched at
-- all). Both CHECKs below carry the three-value shape: `brand_key IS NULL`
-- pairs with `brand_source IS NULL OR = 'none'`; `brand_key IS NOT NULL`
-- pairs only with `brand_source IN ('auto', 'manual')`.
--
-- **One `PRAGMA foreign_keys` window spans both rebuilds.** `transactions`
-- has a foreign key into `recurring_transactions` and `transaction_lines`/
-- `transaction_tags` cascade from `transactions`, so a `DROP TABLE` with
-- foreign keys enforced silently empties a child table and leaves the
-- database referentially perfect — a failure that looks like health. The
-- pragma turns off before the first `CREATE TABLE __new_…` and back on only
-- after the last `RENAME TO`. (The migrator sets the same pragma on the
-- connection before it opens its transaction, since SQLite treats the
-- statement as a no-op inside one; this file states the window it needs so
-- it reads correctly on its own.)
--
-- **The `transactions` rebuild below drops that table's triggers**, which is
-- why `migrate.ts`'s `REPLICA_BACKFILLS["0010_schema"].objects` — the two
-- `transactions_category_kind_matches_type` triggers (WA017) — hangs off
-- *this* step and not the earlier one that introduced them. SQLite deletes a
-- table's triggers with the table and says nothing; the hook re-creates them
-- after the rename, and `invariants/backfills.test.ts` asks `sqlite_master`
-- for both names after the whole chain so the next rebuild of this table
-- cannot lose them quietly. A step that rebuilds `transactions` again takes
-- the hook with it.
CREATE TABLE `brand_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`brand_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`counterparty_id` text,
	`counterparty_role` text,
	`debt_currency` text,
	`debt_amount` text,
	`amount_original` text NOT NULL,
	`currency` text NOT NULL,
	`fx_rate` text NOT NULL,
	`fx_rate_estimated` integer DEFAULT false NOT NULL,
	`to_amount` text,
	`to_currency` text,
	`to_fx_rate` text,
	`payee` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`brand_key` text,
	`brand_source` text,
	`is_business` integer DEFAULT false NOT NULL,
	`is_capital` integer DEFAULT false NOT NULL,
	`recurring_id` text,
	`occurrence_date` text,
	`fee` text,
	`counterparty_tax_id` text,
	`document_ref` text,
	`ksef_id` text,
	`ryczalt_rate` text,
	`ryczalt_activity` text,
	`tax_fx_rate` text,
	`tax_fx_date` text,
	`tax_fx_source` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_debt_amount_requires_currency" CHECK("__new_transactions"."debt_amount" IS NULL OR "__new_transactions"."debt_currency" IS NOT NULL),
	CONSTRAINT "transactions_brand_shape" CHECK(("__new_transactions"."brand_key" IS NULL AND ("__new_transactions"."brand_source" IS NULL OR "__new_transactions"."brand_source" = 'none')) OR ("__new_transactions"."brand_key" IS NOT NULL AND "__new_transactions"."brand_source" IS NOT NULL AND "__new_transactions"."brand_source" IN ('auto', 'manual')))
);
--> statement-breakpoint
-- `brand_key`/`brand_source` are absent from both the column list and the
-- SELECT below, on purpose: drizzle-kit's own generator listed them on the
-- source side too, against a `transactions` that does not have them yet at
-- this point in the chain (they land on `__new_transactions` a few lines
-- up, not on the table this SELECT reads from) — `no such column: brand_key`
-- against a real device. Every existing row gets `NULL` for both, which is
-- the correct starting value for a column §14.4b defines as nullable.
INSERT INTO `__new_transactions`("id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at") SELECT "id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_counterparty_idx` ON `transactions` (`counterparty_id`);--> statement-breakpoint
CREATE TABLE `__new_recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`counterparty_id` text,
	`amount_original` text NOT NULL,
	`currency` text NOT NULL,
	`payee` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`brand_key` text,
	`brand_source` text,
	`rrule` text NOT NULL,
	`next_date` text,
	`end_date` text,
	`enabled` integer DEFAULT true NOT NULL,
	`external_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_transactions_brand_shape" CHECK(("__new_recurring_transactions"."brand_key" IS NULL AND ("__new_recurring_transactions"."brand_source" IS NULL OR "__new_recurring_transactions"."brand_source" = 'none')) OR ("__new_recurring_transactions"."brand_key" IS NOT NULL AND "__new_recurring_transactions"."brand_source" IS NOT NULL AND "__new_recurring_transactions"."brand_source" IN ('auto', 'manual')))
);
--> statement-breakpoint
-- Same reasoning as the `transactions` rebuild above: `brand_key`/
-- `brand_source` are absent from the SELECT because the *old*
-- `recurring_transactions` (pre-this-migration) does not have them either.
INSERT INTO `__new_recurring_transactions`("id", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "amount_original", "currency", "payee", "note", "rrule", "next_date", "end_date", "enabled", "external_id", "created_at", "updated_at", "version") SELECT "id", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "amount_original", "currency", "payee", "note", "rrule", "next_date", "end_date", "enabled", "external_id", "created_at", "updated_at", "version" FROM `recurring_transactions`;--> statement-breakpoint
DROP TABLE `recurring_transactions`;--> statement-breakpoint
ALTER TABLE `__new_recurring_transactions` RENAME TO `recurring_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
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
-- trigger is the only shape available; two per table, because SQLite's
-- `BEFORE UPDATE OF` cannot name a column list the way Postgres can, so each
-- update half guards itself with a `WHEN` on the column actually moving.
--
-- **All four live at the end of the head migration, after the rebuilds
-- above, and that placement is the guarantee.** SQLite drops a table's
-- triggers with the table, so the copy-rename-drop rebuild `transactions`
-- takes a few lines up would silently take
-- `transactions_category_not_archived_insert`/`_update` with it if they had
-- been created in an earlier step — no error, no missing table, just a
-- guarantee that stopped firing. The `transaction_lines` pair is not rebuilt
-- by anything here and would have survived either way; it stays with its
-- siblings so the four read as one guarantee and a future rebuild has one
-- block to move rather than two halves to notice.
-- `migrate.test.ts`'s `sqlite_master` assertion is what fails if a later
-- rebuild lands above these again.
--
-- Hand-written into the head migration rather than added as `0011`: every
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
