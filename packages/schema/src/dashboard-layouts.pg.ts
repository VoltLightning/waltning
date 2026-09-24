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
  /**
   * `seed:<key>` — the stable name of a shipped row, and the only thing that
   * identifies one across two engines and every reinstall.
   *
   * **A seeded row is found by this, never by a uuid written into a
   * migration.** The preset layout shipped as six literal uuids in
   * `0014_dashboard_layout_seed.sql` and six identical ones in the replica's
   * `0011_`, with a test asserting the two lists agreed — which is the second
   * list `bootstrap-taxonomy.ts` already refuses to keep in step: *"74 literal
   * `INSERT`s carrying 74 literal uuids — unreadable, and a second list to
   * keep in step with the first."* Ids are minted where the row is written;
   * this is what makes two of them the same row.
   *
   * Nullable, because a layout a person creates in S24 is theirs and is not a
   * shipped row.
   */
  externalId: k.text("external_id"),
});

export const dashboardLayouts = k.table("dashboard_layouts", dashboardLayoutsColumns());
