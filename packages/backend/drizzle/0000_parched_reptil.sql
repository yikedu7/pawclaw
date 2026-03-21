CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"soul_md" text NOT NULL,
	"skill_md" text NOT NULL,
	"wallet_address" text DEFAULT '' NOT NULL,
	"hunger" integer DEFAULT 100 NOT NULL,
	"mood" integer DEFAULT 100 NOT NULL,
	"affection" integer DEFAULT 0 NOT NULL,
	"llm_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_tick_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"container_id" text,
	"container_host" text,
	"container_port" integer,
	"container_status" text DEFAULT 'pending' NOT NULL,
	"gateway_token" text,
	"port_index" integer
);
--> statement-breakpoint
CREATE TABLE "port_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"port" integer NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "port_allocations_port_unique" UNIQUE("port")
);
--> statement-breakpoint
CREATE TABLE "social_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_pet_id" uuid NOT NULL,
	"to_pet_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_wallet" text NOT NULL,
	"to_wallet" text NOT NULL,
	"amount" numeric NOT NULL,
	"token" text NOT NULL,
	"tx_hash" text NOT NULL,
	"x_layer_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "port_allocations" ADD CONSTRAINT "port_allocations_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_from_pet_id_pets_id_fk" FOREIGN KEY ("from_pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_to_pet_id_pets_id_fk" FOREIGN KEY ("to_pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;