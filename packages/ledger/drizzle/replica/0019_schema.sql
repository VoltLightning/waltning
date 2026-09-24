ALTER TABLE `transactions` ADD `counterparty_id` text REFERENCES counterparties(id);--> statement-breakpoint
CREATE INDEX `transactions_counterparty_idx` ON `transactions` (`counterparty_id`);