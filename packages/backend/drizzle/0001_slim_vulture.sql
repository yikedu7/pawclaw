ALTER TABLE "pets" ALTER COLUMN "container_status" SET DEFAULT 'created';--> statement-breakpoint
ALTER TABLE "port_allocations" ADD COLUMN "released_at" timestamp with time zone;