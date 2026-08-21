import { dashboardLayouts } from "./dashboard-layouts.pg.ts";
import { widgetSize } from "./enums.pg.ts";
import { pgKit as k } from "./kit.ts";

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
  size: widgetSize("size").notNull().default("m"),
  config: k.json<WidgetConfig>("config").notNull().default({}),
  sort: k.integer("sort").notNull().default(0),
});

export const dashboardWidgets = k.table("dashboard_widgets", dashboardWidgetsColumns());
