ALTER TABLE "port_allocations" DROP CONSTRAINT "port_allocations_pet_id_pets_id_fk";
--> statement-breakpoint
ALTER TABLE "social_events" DROP CONSTRAINT "social_events_from_pet_id_pets_id_fk";
--> statement-breakpoint
ALTER TABLE "social_events" DROP CONSTRAINT "social_events_to_pet_id_pets_id_fk";
--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "wallet_address" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "wallet_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "diary_text" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "social_event_id" uuid;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "port_allocations" ADD CONSTRAINT "port_allocations_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_from_pet_id_pets_id_fk" FOREIGN KEY ("from_pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_to_pet_id_pets_id_fk" FOREIGN KEY ("to_pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_social_event_id_social_events_id_fk" FOREIGN KEY ("social_event_id") REFERENCES "public"."social_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pets_owner_id_idx" ON "pets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "port_allocations_pet_id_idx" ON "port_allocations" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "social_events_from_pet_id_idx" ON "social_events" USING btree ("from_pet_id");--> statement-breakpoint
CREATE INDEX "social_events_to_pet_id_idx" ON "social_events" USING btree ("to_pet_id");--> statement-breakpoint
CREATE INDEX "social_events_created_at_idx" ON "social_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tx_hash_idx" ON "transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "transactions_from_wallet_idx" ON "transactions" USING btree ("from_wallet");--> statement-breakpoint
CREATE INDEX "transactions_to_wallet_idx" ON "transactions" USING btree ("to_wallet");--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_container_status_check" CHECK ("pets"."container_status" IN ('created','starting','running','stopping','stopped','deleted'));--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_type_check" CHECK ("social_events"."type" IN ('visit','gift','chat','speak','rest'));--> statement-breakpoint
CREATE UNIQUE INDEX "port_allocations_active_pet_idx" ON "port_allocations" ("pet_id") WHERE "released_at" IS NULL;