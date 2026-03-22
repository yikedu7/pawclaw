ALTER TABLE "social_events" DROP CONSTRAINT "social_events_type_check";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_social_event_id_social_events_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "social_event_id";--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_type_check" CHECK ("social_events"."type" IN ('visit','gift','chat'));