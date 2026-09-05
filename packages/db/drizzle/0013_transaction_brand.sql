-- `SPEC.md` §14.4b — a transaction (and a recurring rule) may carry a
-- Waltning-owned brand key, plus the shared `brand_aliases` reference table
-- the bundled catalogue bootstraps into (`packages/db/src/seed/run.ts`).
-- Both new columns are nullable and default to NULL on every existing row,
-- so `*_brand_shape`'s "both null, or both set" holds for the whole table
-- with nothing to repair — no `NOT VALID` dance is needed here, unlike
-- `0011`/`0012`'s tightened numeric CHECKs.
CREATE TYPE "public"."brand_source" AS ENUM('catalog', 'manual');--> statement-breakpoint
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
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_brand_shape" CHECK (("recurring_transactions"."brand_key" is null) = ("recurring_transactions"."brand_source" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_brand_shape" CHECK (("transactions"."brand_key" is null) = ("transactions"."brand_source" is null));