-- Hand-written, matching `0001_database_objects.sql`'s and
-- `0011_transaction_scale_and_category_kind.sql`'s own precedent: no
-- `schema.ts` change, so `pnpm db:generate` proposes nothing against this —
-- `schema-migration-drift.test.ts` scans for the highest *generated*
-- snapshot on disk for exactly this reason, and finds `0012`'s.
--
-- `DESK4` (`SPEC.md` §14.5) — "A default `dashboard_layouts` row seeded by
-- migration, read but not rearranged (S24 later)." Without this, `S01`'s
-- `get_active_layout` has nothing to read on a fresh database and every
-- desk landing would have to fall back to a hardcoded grid — the "layout is
-- a row, not a constant" rule broken on the very first render.
--
-- **Fixed ids, not `gen_random_uuid()`.** A seeded system row is
-- reference data, the same shape as `currencies` — every fresh database
-- gets the identical row, so a test or a screen can name it directly rather
-- than looking it up by `is_active`. `packages/ledger/drizzle/replica/0010_dashboard_layout_seed.sql`
-- seeds the identical ids on the phone side; the two are never expected to
-- reconcile row-for-row today (arc-phone has no sync yet), but there is no
-- reason for them to disagree when they easily could.
--
-- **Five widgets — exactly what `DESK4`'s board card names the phone-alone
-- ledger able to feed**: `balances` (A1), `recent`, `debt` (E3),
-- `spend_by_category` and `income_vs_expense` (both new class-**S** folds
-- reimplemented as replica folds for this arc — `computations.md` §0, §6,
-- §12). `unsettled` is deliberately not one of these rows: `S01` §4 draws
-- the banner as `Banner(warn)`, a page-level component beside `WidgetGrid`,
-- never a `WidgetCard` inside it — the same shape `today-screen.tsx`
-- already renders it in.
INSERT INTO "dashboard_layouts" ("id", "name", "is_active", "is_preset", "sort")
VALUES ('00000000-0000-4000-8000-00000000d000', 'Standing', true, true, 0);
--> statement-breakpoint
INSERT INTO "dashboard_widgets" ("id", "layout_id", "kind", "slot", "size", "sort")
VALUES
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d000', 'balances', 'a1', 'm', 0),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000d000', 'recent', 'a2', 'm', 1),
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d000', 'debt', 'a3', 's', 2),
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000d000', 'spend_by_category', 'b1', 'm', 3),
  ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000d000', 'income_vs_expense', 'b2', 'l', 4);
