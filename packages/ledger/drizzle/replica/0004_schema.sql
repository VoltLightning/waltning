CREATE TABLE `counterparty_distinct_pairs` (
	`a_id` text NOT NULL,
	`b_id` text NOT NULL,
	PRIMARY KEY(`a_id`, `b_id`),
	FOREIGN KEY (`a_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "counterparty_distinct_pairs_ordered" CHECK("counterparty_distinct_pairs"."a_id" < "counterparty_distinct_pairs"."b_id")
);
--> statement-breakpoint
CREATE TABLE `counterparty_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`winner_id` text NOT NULL,
	`loser_id` text NOT NULL,
	`moved_transaction_ids` text DEFAULT '[]' NOT NULL,
	`merged_at` integer NOT NULL,
	`unmerged_at` integer,
	FOREIGN KEY (`winner_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loser_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `counterparties_name_uq` ON `counterparties` (lower(trim("name")));