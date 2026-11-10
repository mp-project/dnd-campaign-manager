CREATE TYPE "public"."background_customization_mode" AS ENUM('FIXED', 'RULESET_CUSTOMIZABLE');--> statement-breakpoint
CREATE TABLE "backgrounds" (
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
	"customization_mode" "background_customization_mode" DEFAULT 'FIXED' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ability_rule" jsonb DEFAULT '{"mode":"NONE"}'::jsonb NOT NULL,
	"proficiency_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feat_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_tables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "backgrounds_code_format_check" CHECK ("backgrounds"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "backgrounds_description_length_check" CHECK ("backgrounds"."description" is null or char_length("backgrounds"."description") between 1 and 50000),
	CONSTRAINT "backgrounds_display_order_check" CHECK ("backgrounds"."display_order" between 0 and 1000),
	CONSTRAINT "backgrounds_ability_rule_mode_check" CHECK ("backgrounds"."ability_rule" ->> 'mode' in ('NONE', 'FIXED', 'CHOOSE_2024')),
	CONSTRAINT "backgrounds_definition_types_check" CHECK (jsonb_typeof("backgrounds"."sections") = 'array'
        and jsonb_typeof("backgrounds"."ability_rule") = 'object'
        and jsonb_typeof("backgrounds"."proficiency_grants") = 'array'
        and jsonb_typeof("backgrounds"."feat_grants") = 'array'
        and jsonb_typeof("backgrounds"."feature_grants") = 'array'
        and jsonb_typeof("backgrounds"."equipment_options") = 'array'
        and jsonb_typeof("backgrounds"."prompt_tables") = 'array')
);
--> statement-breakpoint
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backgrounds_asset_active_unique_idx" ON "backgrounds" USING btree ("asset_id") WHERE "backgrounds"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "backgrounds_campaign_code_active_unique_idx" ON "backgrounds" USING btree ("campaign_id","code") WHERE "backgrounds"."deleted_at" is null and "backgrounds"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "backgrounds_campaign_idx" ON "backgrounds" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "backgrounds_system_code_idx" ON "backgrounds" USING btree ("code") WHERE "backgrounds"."deleted_at" is null and "backgrounds"."campaign_id" is null;