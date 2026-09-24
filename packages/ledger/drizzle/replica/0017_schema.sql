-- The obligation rename (`SPEC.md` §6.6): `counterparty_id` →
-- `obligation_counterparty_id`, `counterparty_role` → `obligation_role`, and
-- `payee` → `entered_name`. Identity and obligation are separate links, and
-- this step gives the obligation pair the name that says so; the plain
-- `counterparty_id` is left free for the identity link that follows.
--
-- **`recurring_transactions` takes `ALTER TABLE … RENAME COLUMN` and
-- `transactions` takes the copy-rename-drop rebuild**, because SQLite cannot
-- rename a column a CHECK constraint mentions without rebuilding the table,
-- and `transactions` carries two (`transactions_debt_amount_requires_currency`,
-- `transactions_brand_shape`).
--
-- **The copy's `SELECT` names the *old* columns, and the generator's did not.**
-- `drizzle-kit` writes the new names on both sides, which reads from a table
-- that does not have them yet — the mistake `fixtures/upgrade/README.md` names
-- as the one a generated rebuild invites. Three names are hand-corrected here:
-- `counterparty_id`, `counterparty_role` and `payee`, in the positions their
-- renamed columns occupy.
ALTER TABLE `recurring_transactions` RENAME COLUMN "payee" TO "entered_name";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`time_of_day` text,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`obligation_counterparty_id` text,
	`obligation_role` text,
	`debt_currency` text,
	`debt_amount` text,
	`amount_original` text NOT NULL,
	`currency` text NOT NULL,
	`fx_rate` text NOT NULL,
	`fx_rate_estimated` integer DEFAULT false NOT NULL,
	`to_amount` text,
	`to_currency` text,
	`to_fx_rate` text,
	`entered_name` text DEFAULT '' NOT NULL,
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
	FOREIGN KEY (`obligation_counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_debt_amount_requires_currency" CHECK("__new_transactions"."debt_amount" IS NULL OR "__new_transactions"."debt_currency" IS NOT NULL),
	CONSTRAINT "transactions_brand_shape" CHECK(("__new_transactions"."brand_key" IS NULL AND ("__new_transactions"."brand_source" IS NULL OR "__new_transactions"."brand_source" = 'none')) OR ("__new_transactions"."brand_key" IS NOT NULL AND "__new_transactions"."brand_source" IS NOT NULL AND "__new_transactions"."brand_source" IN ('auto', 'manual')))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "date", "time_of_day", "type", "account_id", "to_account_id", "category_id", "obligation_counterparty_id", "obligation_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "entered_name", "note", "brand_key", "brand_source", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at") SELECT "id", "date", "time_of_day", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "brand_key", "brand_source", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_obligation_counterparty_idx` ON `transactions` (`obligation_counterparty_id`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);