ALTER TABLE "accounts" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "in_total" boolean DEFAULT true NOT NULL;