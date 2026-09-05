/**
 * `get_active_layout` (`computations.md`'s data table, `S01` §5), phone side.
 *
 * **The grid is a layout, not a page** (`SPEC.md` §14.5) — `DESK4` seeds one
 * default row by migration (`0014_dashboard_layout_seed.sql` /
 * `0011_dashboard_layout_seed` in `ddl.ts`), and this reads it back exactly
 * the way any other row is read: no fallback grid hardcoded here, because a
 * hardcoded fallback is the thing "a row, not a constant" refuses to have.
 *
 * **`ORDER BY sort, id` on the layout, not only on its widgets.** The
 * migration adds `dashboard_layouts_one_active` to the replica so at most one
 * row can claim `is_active`, and Postgres gets a deferred constraint trigger
 * for the below-bound the index cannot state. Neither bound is a reason to
 * read without an order: a replica restored from a database that predates the
 * index can still hold two active rows, and "whichever row SQLite happens to
 * hand back first" is not an answer a dashboard should be built on.
 *
 * `S24`'s write path (`set_active_layout`) is out of this PR's slice — this
 * is read-only, matching the board's own "read but not rearranged" line.
 */

import type { WidgetSize } from "@waltning/schema/enums";
import type { WidgetConfig } from "@waltning/schema/sqlite/dashboard-widgets";
import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { dashboardLayouts, dashboardWidgets } = ledgerSchema;

export type LocalDashboardWidget = {
  id: string;
  kind: string;
  slot: string;
  size: WidgetSize;
  config: WidgetConfig;
  sort: number;
};

export type LocalDashboardLayout = {
  id: string;
  name: string;
  widgets: readonly LocalDashboardWidget[];
};

/** The active layout and its widgets, in `sort` order — `null` if none is active (an empty, never-migrated database). */
export function readActiveLayout<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): LocalDashboardLayout | null {
  const [layout] = db
    .select({ id: dashboardLayouts.id, name: dashboardLayouts.name })
    .from(dashboardLayouts)
    .where(eq(dashboardLayouts.isActive, true))
    .orderBy(asc(dashboardLayouts.sort), asc(dashboardLayouts.id))
    .all();
  if (!layout) return null;

  const widgets = db
    .select({
      id: dashboardWidgets.id,
      kind: dashboardWidgets.kind,
      slot: dashboardWidgets.slot,
      size: dashboardWidgets.size,
      config: dashboardWidgets.config,
      sort: dashboardWidgets.sort,
    })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.layoutId, layout.id))
    .orderBy(asc(dashboardWidgets.sort))
    .all();

  return { id: layout.id, name: layout.name, widgets };
}
