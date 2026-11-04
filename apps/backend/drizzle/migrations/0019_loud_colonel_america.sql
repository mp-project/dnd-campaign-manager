CREATE TABLE "entity_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"action_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_version" integer NOT NULL,
	"campaign_id" uuid,
	"root_type" text,
	"root_id" uuid,
	"actor_id" uuid,
	"reason" text,
	"revertible" boolean DEFAULT true NOT NULL,
	"reverts_event_id" uuid,
	"restored_from_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_change_fields" (
	"event_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_version" integer NOT NULL,
	"field" text NOT NULL,
	"kind" text NOT NULL,
	"new_value" jsonb,
	"delta" double precision,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"last_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_change_fields_event_id_field_pk" PRIMARY KEY("event_id","field")
);
--> statement-breakpoint
CREATE TABLE "entity_history_horizons" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"trimmed_through_version" integer NOT NULL,
	CONSTRAINT "entity_history_horizons_entity_type_entity_id_field_pk" PRIMARY KEY("entity_type","entity_id","field")
);
--> statement-breakpoint
CREATE TABLE "history_idempotency_keys" (
	"actor_id" uuid NOT NULL,
	"key" text NOT NULL,
	"action_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "history_idempotency_keys_actor_id_key_pk" PRIMARY KEY("actor_id","key")
);
--> statement-breakpoint
ALTER TABLE "entity_change_fields" ADD CONSTRAINT "entity_change_fields_event_id_entity_change_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."entity_change_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_change_events_entity_version_unique_idx" ON "entity_change_events" USING btree ("entity_type","entity_id","entity_version");--> statement-breakpoint
CREATE INDEX "entity_change_events_seq_idx" ON "entity_change_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "entity_change_events_action_id_idx" ON "entity_change_events" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "entity_change_events_root_idx" ON "entity_change_events" USING btree ("root_type","root_id","seq");--> statement-breakpoint
CREATE INDEX "entity_change_events_campaign_idx" ON "entity_change_events" USING btree ("campaign_id","seq");--> statement-breakpoint
CREATE INDEX "entity_change_events_reverts_idx" ON "entity_change_events" USING btree ("reverts_event_id") WHERE "entity_change_events"."reverts_event_id" is not null;--> statement-breakpoint
CREATE INDEX "entity_change_fields_lookup_idx" ON "entity_change_fields" USING btree ("entity_type","entity_id","field","entity_version");