CREATE TABLE "diary_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_pet_id_idx" ON "diary_entries" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "diary_entries_created_at_idx" ON "diary_entries" USING btree ("created_at");