-- The preset's `seed:<key>`, attached to the rows an installed database
-- already holds — and found by what they *are*, never by the uuid they were
-- seeded with.
--
-- **`0014_dashboard_layout_seed.sql` wrote six literal uuids, and the obvious
-- backfill is to name them again here.** That would be a third copy of the
-- same list: two migrations and this file, each frozen at a different moment,
-- all claiming to know which row is `Standing`. `bootstrap-taxonomy.ts`
-- already refuses that arrangement for categories — *"a second list to keep in
-- step with the first"* — so this asks the database instead. The preset is the
-- row with `is_preset`; its widgets are the rows pointing at it. True of a
-- database seeded by that migration, and of one seeded by anything later.
--
-- A widget's key is built from its `kind`, matching
-- `@waltning/core/dashboard`'s `widgetKey`: `kind` is unique within the shipped
-- layout, and unlike `slot` it does not change when a release moves a widget
-- in the grid.
--
-- `packages/ledger/src/migrate.ts`'s `REPLICA_BACKFILLS["0018_schema"].fill`
-- is the phone's half of this, stating the identical two updates.

UPDATE dashboard_layouts
   SET external_id = 'seed:standing'
 WHERE is_preset = true
   AND external_id IS NULL;--> statement-breakpoint

UPDATE dashboard_widgets w
   SET external_id = 'seed:standing:' || w.kind
  FROM dashboard_layouts l
 WHERE l.id = w.layout_id
   AND l.is_preset = true
   AND w.external_id IS NULL;
