CREATE TYPE "public"."campaign_member_role" AS ENUM('EDITOR', 'PLAYER');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."campaign_time_event_type" AS ENUM('ADVANCE_DAYS', 'LONG_REST', 'CORRECTION');--> statement-breakpoint
CREATE TABLE "campaign_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "campaign_member_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_time_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"type" "campaign_time_event_type" NOT NULL,
	"previous_game_day" integer NOT NULL,
	"new_game_day" integer NOT NULL,
	"previous_long_rest_count" integer NOT NULL,
	"new_long_rest_count" integer NOT NULL,
	"reason" text,
	CONSTRAINT "campaign_time_events_previous_game_day_check" CHECK ("campaign_time_events"."previous_game_day" >= 0),
	CONSTRAINT "campaign_time_events_new_game_day_check" CHECK ("campaign_time_events"."new_game_day" >= 0),
	CONSTRAINT "campaign_time_events_previous_long_rest_count_check" CHECK ("campaign_time_events"."previous_long_rest_count" >= 0),
	CONSTRAINT "campaign_time_events_new_long_rest_count_check" CHECK ("campaign_time_events"."new_long_rest_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"owner_user_id" uuid NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"description" text,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"current_game_day" integer DEFAULT 0 NOT NULL,
	"long_rest_count" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "campaigns_current_game_day_check" CHECK ("campaigns"."current_game_day" >= 0),
	CONSTRAINT "campaigns_long_rest_count_check" CHECK ("campaigns"."long_rest_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_time_events" ADD CONSTRAINT "campaign_time_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_memberships_campaign_user_active_unique_idx" ON "campaign_memberships" USING btree ("campaign_id","user_id") WHERE "campaign_memberships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "campaign_memberships_campaign_id_idx" ON "campaign_memberships" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_memberships_user_id_idx" ON "campaign_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campaign_time_events_campaign_id_idx" ON "campaign_time_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_time_events_campaign_created_at_idx" ON "campaign_time_events" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_owner_slug_active_unique_idx" ON "campaigns" USING btree ("owner_user_id","slug") WHERE "campaigns"."deleted_at" is null and "campaigns"."status" <> 'ARCHIVED';--> statement-breakpoint
CREATE INDEX "campaigns_owner_user_id_idx" ON "campaigns" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "campaigns_ruleset_id_idx" ON "campaigns" USING btree ("ruleset_id");