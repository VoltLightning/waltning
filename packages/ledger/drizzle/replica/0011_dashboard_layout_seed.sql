-- Hand-written, matching `0001_database_objects.sql`'s own precedent: rows,
-- not schema, so nothing here came from `pnpm ledger:generate` diffing
-- `schema/src/*.sqlite.ts` — it seeds the identical row and ids
-- `packages/db/drizzle/0014_dashboard_layout_seed.sql` seeds on the server
-- (`DESK4`, `SPEC.md` §14.5). `src/ddl.ts`'s `0011_dashboard_layout_seed`
-- step is embedded from this file's own statements — `migrate.test.ts`
-- hashes both to the same checksum.
--
-- `dashboard_layouts_one_active` is *not* here. It is a schema change, so it
-- is declared on the table in `schema/src/dashboard-layouts.sqlite.ts` and
-- generated into `0012_schema.sql` like every other index — a hand-written
-- `CREATE INDEX` in a seed file is an index the generator cannot see, which
-- means the next `generate` emits it a second time. It runs after this file,
-- which is the right order either way: one active row is already seeded when
-- the index that permits exactly one arrives.
INSERT INTO `dashboard_layouts` (`id`, `name`, `is_active`, `is_preset`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d000', 'Standing', 1, 1, 0);
--> statement-breakpoint
INSERT INTO `dashboard_widgets` (`id`, `layout_id`, `kind`, `slot`, `size`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d000', 'balances', 'a1', 'm', 0);
--> statement-breakpoint
INSERT INTO `dashboard_widgets` (`id`, `layout_id`, `kind`, `slot`, `size`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000d000', 'recent', 'a2', 'm', 1);
--> statement-breakpoint
INSERT INTO `dashboard_widgets` (`id`, `layout_id`, `kind`, `slot`, `size`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d000', 'debt', 'a3', 's', 2);
--> statement-breakpoint
INSERT INTO `dashboard_widgets` (`id`, `layout_id`, `kind`, `slot`, `size`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000d000', 'spend_by_category', 'b1', 'm', 3);
--> statement-breakpoint
INSERT INTO `dashboard_widgets` (`id`, `layout_id`, `kind`, `slot`, `size`, `sort`) VALUES ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000d000', 'income_vs_expense', 'b2', 'l', 4);
