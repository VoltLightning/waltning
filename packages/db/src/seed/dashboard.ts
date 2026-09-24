/**
 * The shipped dashboard on the server, keyed the way the category tree is.
 *
 * **`0014_dashboard_layout_seed.sql` still creates these rows, and this does
 * not replace it.** A migration's statements are frozen, so that file will go
 * on inserting the six uuids it names for as long as a fresh database runs the
 * chain. What changes is that nothing *identifies* a row by them any more:
 * `0021_dashboard_seed_key_backfill.sql` attaches `seed:<key>` to whatever the
 * preset already is, and from there this function — and
 * `packages/ledger/src/dashboard/bootstrap-dashboard.ts` on the phone — read
 * the same list out of `@waltning/core/dashboard` and match on the key.
 *
 * **Upserted, not `ON CONFLICT DO NOTHING`**, and the distinction is
 * `seed/run.ts`'s own: reference data is bootstrapped and left alone, while a
 * list this repository *defines* is carried through. The preset is the second
 * kind — moving a widget or changing its size in `@waltning/core/dashboard` is
 * a change the shipped layout is expected to take. A layout a person built in
 * S24 carries no key and is never touched.
 */

import { layoutKey, PRESET_LAYOUT, widgetKey } from "@waltning/core/dashboard";
import type { Id } from "@waltning/core/id";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { requireRow } from "../rows.ts";
import { dashboardLayouts, dashboardWidgets } from "../schema.ts";

export type SeededDashboard = { layouts: number; widgets: number };

export async function seedDashboard(db: Database): Promise<SeededDashboard> {
  const key = layoutKey(PRESET_LAYOUT);

  const existing = await db
    .select({ id: dashboardLayouts.id })
    .from(dashboardLayouts)
    .where(eq(dashboardLayouts.externalId, key))
    .limit(1);

  let layoutId: Id<"dashboardLayouts">;
  if (existing[0]) {
    layoutId = existing[0].id;
    await db
      .update(dashboardLayouts)
      .set({ name: PRESET_LAYOUT.name, isPreset: true })
      .where(eq(dashboardLayouts.id, layoutId));
  } else {
    // `is_active` only on creation: which layout a person is looking at is
    // theirs to decide once they have more than one, and re-seeding must not
    // drag them back to the preset.
    const rows = await db
      .insert(dashboardLayouts)
      .values({
        name: PRESET_LAYOUT.name,
        isActive: true,
        isPreset: true,
        sort: 0,
        externalId: key,
      })
      .returning({ id: dashboardLayouts.id });
    layoutId = requireRow(rows, "seed dashboard layout").id;
  }

  let widgets = 0;
  for (const [index, widget] of PRESET_LAYOUT.widgets.entries()) {
    const widgetExternalId = widgetKey(PRESET_LAYOUT, widget);
    const found = await db
      .select({ id: dashboardWidgets.id })
      .from(dashboardWidgets)
      .where(eq(dashboardWidgets.externalId, widgetExternalId))
      .limit(1);

    if (found[0]) {
      await db
        .update(dashboardWidgets)
        .set({ layoutId, kind: widget.kind, slot: widget.slot, size: widget.size, sort: index })
        .where(eq(dashboardWidgets.id, found[0].id));
    } else {
      await db.insert(dashboardWidgets).values({
        layoutId,
        kind: widget.kind,
        slot: widget.slot,
        size: widget.size,
        config: {},
        sort: index,
        externalId: widgetExternalId,
      });
    }
    widgets++;
  }

  return { layouts: 1, widgets };
}
