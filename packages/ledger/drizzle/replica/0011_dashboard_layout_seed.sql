-- Hand-written, matching `0001_database_objects.sql`'s own precedent: no
-- schema change, so nothing here came from `pnpm ledger:generate` diffing
-- `schema/src/*.sqlite.ts` — it seeds the identical row and ids
-- `packages/db/drizzle/0014_dashboard_layout_seed.sql` seeds on the server
-- (`DESK4`, `SPEC.md` §14.5). `src/ddl.ts`'s `0011_dashboard_layout_seed`
-- step is embedded from this file's own statements — `migrate.test.ts`
-- hashes both to the same checksum.
--
-- The partial unique index at the end is the replica's half of
-- `dashboard_layouts_one_active`, which `packages/db` has had since `0000` and
-- the phone had not: `readActiveLayout` picks one row out of whatever claims
-- to be active, and until this index existed nothing on this side stopped two
-- rows from claiming it. SQLite has no deferred constraint trigger, so the
-- below-bound stays Postgres's alone; this closes the above-bound, which is
-- the half that decides which layout a phone draws.
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
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_layouts_one_active` ON `dashboard_layouts` (`is_active`) WHERE `is_active` = 1;
