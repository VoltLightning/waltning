CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`deps` text NOT NULL,
	`op_version` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`blocked_kind` text,
	`blocked_reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`captured_at` integer NOT NULL,
	`captured_tz` text NOT NULL,
	`captured_offset_minutes` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_pending_by_seq` ON `outbox` (`state`,`seq`);--> statement-breakpoint
CREATE TABLE `outbox_seq` (
	`id` integer PRIMARY KEY NOT NULL,
	`issued` integer NOT NULL
);
