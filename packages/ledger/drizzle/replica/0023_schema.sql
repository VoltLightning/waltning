CREATE TABLE `opening_debts` (
	`id` text PRIMARY KEY NOT NULL,
	`counterparty_id` text NOT NULL,
	`currency` text NOT NULL,
	`direction` text NOT NULL,
	`amount` text NOT NULL,
	`date` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "opening_debts_amount_positive" CHECK(cast("opening_debts"."amount" as real) > 0),
	CONSTRAINT "opening_debts_amount_ceiling" CHECK(length(substr("opening_debts"."amount", 1, instr("opening_debts"."amount" || '.', '.') - 1)) <= 9),
	CONSTRAINT "opening_debts_direction_known" CHECK("opening_debts"."direction" in ('theyOwe', 'youOwe'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opening_debts_counterparty_currency_uq` ON `opening_debts` (`counterparty_id`,`currency`) WHERE "opening_debts"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE `counterparty_merges` ADD `moved_opening_debts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `settles_opening_debt_id` text REFERENCES opening_debts(id);