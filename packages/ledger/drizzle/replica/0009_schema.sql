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
	CONSTRAINT "fx_rates_rate_bounds" CHECK(cast("__new_fx_rates"."rate" as real) > 0.000000000001 and cast("__new_fx_rates"."rate" as real) < 1000000000000)
);
--> statement-breakpoint
INSERT INTO `__new_fx_rates`("base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at") SELECT "base", "quote", "date", "rate", "source", "fetched_at", "displaced_rate", "displaced_source", "displaced_fetched_at" FROM `fx_rates`;--> statement-breakpoint
DROP TABLE `fx_rates`;--> statement-breakpoint
ALTER TABLE `__new_fx_rates` RENAME TO `fx_rates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_pk` ON `fx_rates` (`base`,`quote`,`date`);