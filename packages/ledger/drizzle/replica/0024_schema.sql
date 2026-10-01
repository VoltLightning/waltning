ALTER TABLE `transactions` ADD `paid_amount` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `paid_currency` text REFERENCES currencies(code);