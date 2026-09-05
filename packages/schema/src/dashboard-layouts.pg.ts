import { pgKit as k } from "./kit.ts";

/**
 * Both unique indexes stay in `packages/db`, where every other Postgres index
 * is declared: the normalised name (`lower(btrim(name))`, an expression this
 * shared module has no kit for) and the partial index over `(true)` that
 * permits exactly one active layout. The replica states the second of those
 * for itself — see `dashboard-layouts.sqlite.ts` for which of the two it
 * carries and why the other waits.
 */
export const dashboardLayoutsColumns = () => ({
  id: k.id<"dashboardLayouts">("id"),
  name: k.text("name").notNull(),
  isActive: k.boolean("is_active").notNull().default(false),
  isPreset: k.boolean("is_preset").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
});

export const dashboardLayouts = k.table("dashboard_layouts", dashboardLayoutsColumns());
