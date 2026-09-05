ALTER TABLE `outbox` ADD `disposition` text;--> statement-breakpoint
CREATE INDEX `outbox_deferred` ON `outbox` (`disposition`) WHERE "outbox"."disposition" = 'deferred';