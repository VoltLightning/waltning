/**
 * `SPEC.md` §14.5 — the shipped dashboard, and the claim that matters here is
 * not "the rows exist" but **"re-seeding finds the row it already made"**.
 *
 * The preset used to be identified by six uuids written into
 * `0014_dashboard_layout_seed.sql` and six more written into the replica's
 * own migration. Nothing looks them up by id now: `external_id` carries
 * `seed:<key>`, and this is where that is proved against real Postgres — by
 * running the seed twice over a database whose chain already created the
 * rows, which is the exact situation a fresh install is in.
 *
 * A second `Standing` appearing would also be caught by
 * `dashboard_layouts_one_active`, but that index says *"two active layouts"*,
 * not *"the seed could not find its own row"*. The counts below say the
 * second thing.
 */

import { layoutKey, PRESET_LAYOUT, widgetKey } from "@waltning/core/dashboard";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dashboardLayouts, dashboardWidgets } from "../schema.ts";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";
import { seedDashboard } from "./dashboard.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("seed_dashboard");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

const layouts = async () =>
  await s.db
    .select({ n: count() })
    .from(dashboardLayouts)
    .then((rows) => Number(rows[0]?.n ?? 0));

const widgets = async () =>
  await s.db
    .select({ n: count() })
    .from(dashboardWidgets)
    .then((rows) => Number(rows[0]?.n ?? 0));

describe("seedDashboard", () => {
  it("adopts the rows the chain already created, by key rather than by id", async () => {
    // The chain has already run — `0014_` inserted the preset and `0021_`
    // attached its key — so this is a database that is *not* empty.
    const before = { layouts: await layouts(), widgets: await widgets() };
    expect(before.layouts, "the chain seeded a layout").toBeGreaterThan(0);

    const result = await seedDashboard(s.db);
    expect(result.widgets).toBe(PRESET_LAYOUT.widgets.length);

    expect(await layouts(), "no second Standing").toBe(before.layouts);
    expect(await widgets(), "no duplicated widgets").toBe(before.widgets);
  });

  it("is idempotent — a second run changes nothing", async () => {
    const before = { layouts: await layouts(), widgets: await widgets() };
    await seedDashboard(s.db);
    await seedDashboard(s.db);
    expect(await layouts()).toBe(before.layouts);
    expect(await widgets()).toBe(before.widgets);
  });

  it("carries a changed preset through — the list is the definition, not a starting point", async () => {
    // A widget moved in the grid, the way a later release would move it.
    const moved = PRESET_LAYOUT.widgets[0];
    if (!moved) throw new Error("the preset ships no widgets");
    await s.db
      .update(dashboardWidgets)
      .set({ slot: "z9" })
      .where(eq(dashboardWidgets.externalId, widgetKey(PRESET_LAYOUT, moved)));

    await seedDashboard(s.db);

    const [row] = await s.db
      .select({ slot: dashboardWidgets.slot })
      .from(dashboardWidgets)
      .where(eq(dashboardWidgets.externalId, widgetKey(PRESET_LAYOUT, moved)));
    expect(row?.slot, "the shipped slot, restored").toBe(moved.slot);
  });

  it("leaves a layout a person made alone — no key, not ours", async () => {
    await s.db
      .insert(dashboardLayouts)
      .values({ name: "Mine", isActive: false, isPreset: false, sort: 1 });

    await seedDashboard(s.db);

    const [mine] = await s.db
      .select({ name: dashboardLayouts.name, externalId: dashboardLayouts.externalId })
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.name, "Mine"));
    expect(mine?.name).toBe("Mine");
    expect(mine?.externalId, "a person's layout carries no seed key").toBeNull();

    const [preset] = await s.db
      .select({ externalId: dashboardLayouts.externalId })
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.isPreset, true));
    expect(preset?.externalId).toBe(layoutKey(PRESET_LAYOUT));
  });
});
