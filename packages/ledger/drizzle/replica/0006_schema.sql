DROP INDEX `counterparties_name_uq`;--> statement-breakpoint
ALTER TABLE `counterparties` ADD `name_folded` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `counterparties_name_uq` ON `counterparties` (`name_folded`) WHERE not "counterparties"."archived";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_counterparty_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`winner_id` text NOT NULL,
	`loser_id` text NOT NULL,
	`moved_transaction_ids` text DEFAULT '[]' NOT NULL,
	`merged_at` integer NOT NULL,
	`unmerged_at` integer,
	FOREIGN KEY (`winner_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loser_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "counterparty_merges_winner_ne_loser" CHECK("__new_counterparty_merges"."winner_id" <> "__new_counterparty_merges"."loser_id")
);
--> statement-breakpoint
INSERT INTO `__new_counterparty_merges`("id", "winner_id", "loser_id", "moved_transaction_ids", "merged_at", "unmerged_at") SELECT "id", "winner_id", "loser_id", "moved_transaction_ids", "merged_at", "unmerged_at" FROM `counterparty_merges`;--> statement-breakpoint
DROP TABLE `counterparty_merges`;--> statement-breakpoint
ALTER TABLE `__new_counterparty_merges` RENAME TO `counterparty_merges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `counterparty_merges_loser_open_uq` ON `counterparty_merges` (`loser_id`) WHERE "counterparty_merges"."unmerged_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_counterparty_idx` ON `transactions` (`counterparty_id`);