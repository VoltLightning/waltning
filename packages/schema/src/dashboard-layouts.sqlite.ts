import { sqliteKit as k } from "./kit.ts";

/**
 * Both unique indexes stay in `packages/db`: the normalised name, and the
 * partial index over `(true)` that permits exactly one active layout — a
 * Postgres construction with no SQLite equivalent.
 */
export const dashboardLayoutsColumns = () => ({
  id: k.id<"dashboardLayouts">("id"),
  name: k.text("name").notNull(),
  isActive: k.boolean("is_active").notNull().default(false),
  isPreset: k.boolean("is_preset").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
});

export const dashboardLayouts = k.table("dashboard_layouts", dashboardLayoutsColumns());
