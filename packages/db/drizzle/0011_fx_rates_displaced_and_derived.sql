ALTER TYPE "public"."fx_source" ADD VALUE 'derived';--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_rate" numeric(24, 12);--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_source" "fx_source";--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "displaced_fetched_at" timestamp with time zone;