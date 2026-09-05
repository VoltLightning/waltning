import { sql } from "drizzle-orm";
import { sqliteKit as k } from "./kit.ts";

/**
 * **`dashboard_layouts_one_active` is declared here, so the generator emits
 * it.** SQLite has supported partial indexes since 3.8.0, and
 * `counterparties_name_uq` two files over is already one — the earlier claim
 * that this was "a Postgres construction with no SQLite equivalent" was
 * simply wrong, and it cost the phone the index: `readActiveLayout` picks one
 * row out of whatever claims to be active, and nothing on this side stopped
 * two rows from claiming it. Postgres states the same rule as
 * `on((true)) where is_active`; SQLite cannot index a constant expression, so
 * it indexes the column under the same predicate, which forbids exactly the
 * same second row.
 *
 * The *below*-bound stays Postgres's alone — "at least one active layout" is
 * a deferred constraint trigger (`WA019`), and SQLite has no deferred
 * constraints to state it with. This index closes the above-bound, which is
 * the half that decides which layout a phone draws.
 *
 * **`dashboard_layouts_name_uq` is not replicated, because nothing on the
 * phone writes a layout.** There is no registry operation that creates or
 * renames one until `S24`; the replica receives the seeded `Standing` row and
 * reads it. A uniqueness rule with no writer to refuse forbids nothing — it
 * would be a constraint whose first real test is the day the operation
 * arrives, which is the day to add it (with the normalised column it needs,
 * that this schema also does not carry). The one-active index is different:
 * it bounds a *read* this build already makes.
 */
export const dashboardLayoutsColumns = () => ({
  id: k.id<"dashboardLayouts">("id"),
  name: k.text("name").notNull(),
  isActive: k.boolean("is_active").notNull().default(false),
  isPreset: k.boolean("is_preset").notNull().default(false),
  sort: k.integer("sort").notNull().default(0),
});

export const dashboardLayouts = k.table("dashboard_layouts", dashboardLayoutsColumns(), (t) => [
  k.uniqueIndex("dashboard_layouts_one_active").on(t.isActive).where(sql`${t.isActive} = 1`),
]);
