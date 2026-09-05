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
	CONSTRAINT "transactions_debt_amount_requires_currency" CHECK("__new_transactions"."debt_amount" IS NULL OR "__new_transactions"."debt_currency" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at") SELECT "id", "date", "type", "account_id", "to_account_id", "category_id", "counterparty_id", "counterparty_role", "debt_currency", "debt_amount", "amount_original", "currency", "fx_rate", "fx_rate_estimated", "to_amount", "to_currency", "to_fx_rate", "payee", "note", "is_business", "is_capital", "recurring_id", "occurrence_date", "fee", "counterparty_tax_id", "document_ref", "ksef_id", "ryczalt_rate", "ryczalt_activity", "tax_fx_rate", "tax_fx_date", "tax_fx_source", "source", "external_id", "created_at", "updated_at", "version", "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_counterparty_idx` ON `transactions` (`counterparty_id`);