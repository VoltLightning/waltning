/**
 * The dashboard the app ships with — `SPEC.md` §14.5's *"a default
 * `dashboard_layouts` row … read but not rearranged"*.
 *
 * **Here rather than in two migrations, for the reason `taxonomy.ts` already
 * gives.** The preset shipped as six literal uuids in
 * `packages/db/drizzle/0014_dashboard_layout_seed.sql` and six identical ones
 * in `packages/ledger/drizzle/replica/0011_dashboard_layout_seed.sql`, with a
 * test asserting the two files named the same uuids row for row. That is the
 * "second list to keep in step with the first" this repository already refuses
 * for categories: a migration's statements are frozen the day they ship, so
 * the ids in them can never be anything but written down, and two files
 * written down separately agree only for as long as somebody keeps checking.
 *
 * Both engines now read this one list, and neither knows an id until it mints
 * one. What makes a row on the phone and a row on the server *the same* row is
 * its `seed:<key>` — the same mechanism `categories.external_id` already uses,
 * and the same reason: two engines agreeing on which row is `Standing`
 * without ever having agreed on a uuid.
 */

/** One widget of a shipped layout. `slot` is its position in the grid. */
export type SeedWidget = {
  /** Unique within the layout: this is what `seed:<layout>:<kind>` is built from. */
  kind: string;
  slot: string;
  size: "s" | "m" | "l";
};

export type SeedLayout = {
  key: string;
  name: string;
  widgets: readonly SeedWidget[];
};

/**
 * `Standing` — the one preset, and the layout a fresh database is active on.
 *
 * The five widgets and their slots are `0014_dashboard_layout_seed.sql`'s own,
 * unchanged: this moves where the list lives, not what it says. An installed
 * database already holds these rows and keeps them; the key is attached to
 * them by migration rather than re-seeded over the top.
 */
export const PRESET_LAYOUT: SeedLayout = {
  key: "standing",
  name: "Standing",
  widgets: [
    { kind: "balances", slot: "a1", size: "m" },
    { kind: "recent", slot: "a2", size: "m" },
    { kind: "debt", slot: "a3", size: "s" },
    { kind: "spend_by_category", slot: "b1", size: "m" },
    { kind: "income_vs_expense", slot: "b2", size: "l" },
  ],
};

/** `seed:standing` — a layout's stable name, on either engine. */
export function layoutKey(layout: SeedLayout): string {
  return `seed:${layout.key}`;
}

/**
 * `seed:standing:balances` — a widget's.
 *
 * Built from the layout's key and the widget's `kind` rather than its `slot`,
 * because a later release may move a widget in the grid and that must not make
 * it a different row; changing what a widget *is* legitimately does.
 */
export function widgetKey(layout: SeedLayout, widget: SeedWidget): string {
  return `seed:${layout.key}:${widget.kind}`;
}
