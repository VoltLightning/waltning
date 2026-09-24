/**
 * The shipped dashboard, materialised on the device.
 *
 * **A bootstrap, not a migration, and not a hardcoded id anywhere** — the same
 * argument `bootstrap-taxonomy.ts` makes one folder over, and the preset is
 * the case that made it worth generalising. `0011_dashboard_layout_seed.sql`
 * seeds six literal uuids, `packages/db`'s `0014_` seeds six identical ones,
 * and `migrations.test.ts` asserted the two files agreed row for row. A
 * migration's statements are frozen the day they ship, so those ids could
 * never be anything but written down; the test was the upkeep that writing
 * them down costs. `@waltning/core/dashboard` is the list now, this writes it
 * into the replica, and `external_id` is what says two rows are one row.
 *
 * **It seeds a ledger that has no layouts, and only that one.** A person who
 * has arranged their own dashboard (S24) has decided what it is, and a second
 * `Standing` arriving beside theirs would be a row nobody asked for competing
 * for the one-active index. So a non-empty table is left exactly as it is.
 *
 * **`external_id` is what makes the rest of it idempotent**, the same
 * `seed:<key>` the server's own upsert matches on — so the two engines agree
 * on which row is `Standing` without ever having agreed on a uuid. Re-running
 * changes nothing: a row already carrying that key is left as it is, renamed
 * or rearranged, because after the first run this is the person's dashboard
 * and not ours.
 *
 * **It does not run on a fresh install either, and that is not a defect.**
 * `0011_dashboard_layout_seed.sql` is frozen and runs first on every chain, so
 * a brand-new replica already has the preset by the time a session opens, and
 * `0018_schema`'s backfill has already attached `seed:standing` to it — found
 * by `is_preset`, never by the uuid it was seeded with. What that leaves is
 * the arrangement the whole change is after: the uuids still exist, and
 * nothing identifies a row by them.
 *
 * So the two callers this actually has are a ledger with no layouts at all,
 * and — once S24 can write one — the next release that changes what ships.
 * A preset change belongs here rather than in a new migration, for the reason
 * at the top: a migration would have to name ids, and naming them is what
 * needed undoing.
 */

import { layoutKey, PRESET_LAYOUT, widgetKey } from "@waltning/core/dashboard";
import { id as brand, type Id } from "@waltning/core/id";
import type { IdGenerator } from "@waltning/core/random";
import { count } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { dashboardLayouts, dashboardWidgets } = ledgerSchema;

export function bootstrapDashboard<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  mintId: IdGenerator,
): void {
  // Started already — see the file header. Counted rather than probed for a
  // `seed:` row, because a ledger holding only a person's own layouts is just
  // as started as one holding this.
  const [existing] = db.select({ n: count() }).from(dashboardLayouts).all();
  if ((existing?.n ?? 0) > 0) return;

  const layoutId = brand<"dashboardLayouts">(mintId());
  db.insert(dashboardLayouts)
    .values({
      id: layoutId,
      name: PRESET_LAYOUT.name,
      isActive: true,
      isPreset: true,
      sort: 0,
      externalId: layoutKey(PRESET_LAYOUT),
    })
    .onConflictDoNothing({ target: dashboardLayouts.externalId })
    .run();

  const widgets = PRESET_LAYOUT.widgets.map((widget, index) => ({
    id: brand<"dashboardWidgets">(mintId()),
    layoutId: layoutId as Id<"dashboardLayouts">,
    kind: widget.kind,
    slot: widget.slot,
    size: widget.size,
    config: {},
    sort: index,
    externalId: widgetKey(PRESET_LAYOUT, widget),
  }));
  if (widgets.length === 0) return;
  db.insert(dashboardWidgets)
    .values(widgets)
    .onConflictDoNothing({ target: dashboardWidgets.externalId })
    .run();
}
