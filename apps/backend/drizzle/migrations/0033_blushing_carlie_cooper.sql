CREATE TYPE "public"."feat_category" AS ENUM('ORIGIN', 'GENERAL', 'FIGHTING_STYLE', 'EPIC_BOON');--> statement-breakpoint
CREATE TYPE "public"."feat_prerequisite_check_mode" AS ENUM('ON_ACQUISITION', 'CONTINUOUS');--> statement-breakpoint
CREATE TABLE "feats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid,
	"asset_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"category" "feat_category" NOT NULL,
	"minimum_character_level" integer,
	"prerequisite_check_mode" "feat_prerequisite_check_mode" DEFAULT 'ON_ACQUISITION' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"prerequisites" jsonb,
	"repeatability" jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "feats_code_format_check" CHECK ("feats"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "feats_description_length_check" CHECK ("feats"."description" is null or char_length("feats"."description") between 1 and 50000),
	CONSTRAINT "feats_minimum_level_check" CHECK ("feats"."minimum_character_level" is null or "feats"."minimum_character_level" between 1 and 20),
	CONSTRAINT "feats_display_order_check" CHECK ("feats"."display_order" between 0 and 1000),
	CONSTRAINT "feats_definition_types_check" CHECK (("feats"."prerequisites" is null or jsonb_typeof("feats"."prerequisites") = 'object')
        and jsonb_typeof("feats"."repeatability") = 'object'
        and jsonb_typeof("feats"."choices") = 'array'
        and jsonb_typeof("feats"."feature_grants") = 'array')
);
--> statement-breakpoint
ALTER TABLE "feats" ADD CONSTRAINT "feats_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feats" ADD CONSTRAINT "feats_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feats" ADD CONSTRAINT "feats_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feats_asset_active_unique_idx" ON "feats" USING btree ("asset_id") WHERE "feats"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "feats_campaign_code_active_unique_idx" ON "feats" USING btree ("campaign_id","code") WHERE "feats"."deleted_at" is null and "feats"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "feats_campaign_idx" ON "feats" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "feats_system_code_idx" ON "feats" USING btree ("code") WHERE "feats"."deleted_at" is null and "feats"."campaign_id" is null;