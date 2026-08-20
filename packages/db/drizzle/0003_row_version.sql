ALTER TABLE "accounts" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "currencies" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "currencies" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;