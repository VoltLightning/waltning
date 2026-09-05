-- `SPEC.md` §14.4b — a transaction (and a recurring rule) may carry a
-- Waltning-owned brand key, plus the shared `brand_aliases` reference table
-- the bundled catalogue bootstraps into (`packages/db/src/seed/run.ts`).
-- Both new columns are nullable and default to NULL on every existing row,
-- so `*_brand_shape`'s "both null, or both set" holds for the whole table
-- with nothing to repair — no `NOT VALID` dance is needed here, unlike
-- `0011`/`0012`'s tightened numeric CHECKs.
--
-- Round 1's M4 — edited in place under the owner's own ruling: this
-- migration has not been installed anywhere yet ("every database is
-- disposable until first install"), so the enum and the two CHECKs below
-- carry the corrected three-value `brand_source` shape from the start,
-- rather than a second migration re-shaping what this one just created.
-- `brand_source` gained `'none'` for a *deliberate* "no brand" (a cleared
-- catalogue match), distinct from `NULL`/`NULL` (never matched at all); the
-- CHECKs' `brand_source is not null and` before each `in (...)` is
-- load-bearing, not decoration — see their own comment below.
CREATE TYPE "public"."brand_source" AS ENUM('auto', 'manual', 'none');--> statement-breakpoint
CREATE TABLE "brand_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"brand_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_aliases_alias_not_blank" CHECK (length(btrim("brand_aliases"."alias")) > 0),
	CONSTRAINT "brand_aliases_key_not_blank" CHECK (length(btrim("brand_aliases"."brand_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "brand_key" text;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "brand_source" "brand_source";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "brand_key" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "brand_source" "brand_source";--> statement-breakpoint
-- `brand_source is not null and` is load-bearing, not decoration: Postgres
-- admits a CHECK whenever it evaluates to NULL, only an explicit `false` is
-- a violation, and `x in (...)` on a NULL `x` is itself NULL. Without this
-- clause, `brand_key` set with `brand_source` left NULL — exactly the row
-- this CHECK exists to refuse — makes the whole expression NULL and is
-- silently admitted (`brand-shape.test.ts` breaks this once, live).
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_brand_shape" CHECK (("recurring_transactions"."brand_key" is null and ("recurring_transactions"."brand_source" is null or "recurring_transactions"."brand_source" = 'none')) or ("recurring_transactions"."brand_key" is not null and "recurring_transactions"."brand_source" is not null and "recurring_transactions"."brand_source" in ('auto', 'manual')));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_brand_shape" CHECK (("transactions"."brand_key" is null and ("transactions"."brand_source" is null or "transactions"."brand_source" = 'none')) or ("transactions"."brand_key" is not null and "transactions"."brand_source" is not null and "transactions"."brand_source" in ('auto', 'manual')));