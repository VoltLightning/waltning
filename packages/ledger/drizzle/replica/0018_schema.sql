ALTER TABLE `dashboard_layouts` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_external_id_uq` ON `dashboard_layouts` (`external_id`);--> statement-breakpoint
ALTER TABLE `dashboard_widgets` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_widgets_external_id_uq` ON `dashboard_widgets` (`external_id`);