import { dashboardLayouts } from "./dashboard-layouts.sqlite.ts";
import { WIDGET_SIZE } from "./enums.ts";
import { sqliteKit as k } from "./kit.ts";

/** A widget's configuration is per-kind, so the shape is open by design. */
export type WidgetConfig = Record<string, unknown>;

export const dashboardWidgetsColumns = () => ({
  id: k.id<"dashboardWidgets">("id"),
  layoutId: k
    .uuid("layout_id")
    .notNull()
    .references(() => dashboardLayouts.id, { onDelete: "cascade" }),
  kind: k.text("kind").notNull(),
  slot: k.text("slot").notNull(),
  size: k.text("size", { enum: WIDGET_SIZE }).notNull().default("m"),
  config: k.json<WidgetConfig>("config").notNull().default({}),
  sort: k.integer("sort").notNull().default(0),
  /** `seed:<layout>:<kind>` — see `dashboard-layouts`' own field. */
  externalId: k.text("external_id"),
});

export const dashboardWidgets = k.table("dashboard_widgets", dashboardWidgetsColumns(), (t) => [
  /** The widget half of `dashboard_layouts_external_id_uq`'s own argument. */
  k.uniqueIndex("dashboard_widgets_external_id_uq").on(t.externalId),
]);
