ALTER TABLE "dashboard_layouts" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_external_id_uq" ON "dashboard_layouts" USING btree ("external_id") WHERE "dashboard_layouts"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_widgets_external_id_uq" ON "dashboard_widgets" USING btree ("external_id") WHERE "dashboard_widgets"."external_id" is not null;