ALTER TABLE "pets" ADD COLUMN "system_credits" numeric NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "onchain_balance" numeric NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "initial_credits" TYPE numeric USING initial_credits::numeric;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "initial_credits" SET DEFAULT 0.3;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "hunger" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "mood" SET DEFAULT 80;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "affection" SET DEFAULT 20;--> statement-breakpoint
UPDATE "pets" SET "system_credits" = COALESCE(paw_balance::numeric, 0);--> statement-breakpoint
ALTER TABLE "pets" DROP COLUMN "paw_balance";
