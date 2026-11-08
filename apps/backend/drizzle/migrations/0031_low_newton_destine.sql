CREATE TYPE "public"."species_creature_type" AS ENUM('ABERRATION', 'BEAST', 'CELESTIAL', 'CONSTRUCT', 'DRAGON', 'ELEMENTAL', 'FEY', 'FIEND', 'GIANT', 'HUMANOID', 'MONSTROSITY', 'OOZE', 'PLANT', 'UNDEAD');--> statement-breakpoint
CREATE TYPE "public"."species_lifespan_mode" AS ENUM('RULESET_DEFAULT', 'SPECIES_SPECIFIC', 'UNSPECIFIED');--> statement-breakpoint
CREATE TABLE "species" (
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
	"creature_type" "species_creature_type" NOT NULL,
	"lifespan_mode" "species_lifespan_mode" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"size_options" jsonb NOT NULL,
	"movement_modes" jsonb NOT NULL,
	"age_profile" jsonb,
	"physical_profile" jsonb,
	"text_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "species_code_format_check" CHECK ("species"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "species_description_length_check" CHECK ("species"."description" is null or char_length("species"."description") between 1 and 50000),
	CONSTRAINT "species_display_order_check" CHECK ("species"."display_order" between 0 and 1000),
	CONSTRAINT "species_definition_types_check" CHECK (jsonb_typeof("species"."size_options") = 'array'
        and jsonb_typeof("species"."movement_modes") = 'array'
        and ("species"."age_profile" is null or jsonb_typeof("species"."age_profile") = 'object')
        and ("species"."physical_profile" is null or jsonb_typeof("species"."physical_profile") = 'object')
        and jsonb_typeof("species"."text_sections") = 'array'
        and jsonb_typeof("species"."variant_groups") = 'array'
        and jsonb_typeof("species"."feature_grants") = 'array'),
	CONSTRAINT "species_size_movement_count_check" CHECK (jsonb_array_length("species"."size_options") >= 1
        and jsonb_array_length("species"."movement_modes") >= 1)
);
--> statement-breakpoint
CREATE TABLE "species_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid,
	"asset_id" uuid NOT NULL,
	"species_id" uuid NOT NULL,
	"variant_group_code" varchar(64) NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"feature_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "species_variants_code_format_check" CHECK ("species_variants"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "species_variants_group_code_format_check" CHECK ("species_variants"."variant_group_code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "species_variants_description_length_check" CHECK ("species_variants"."description" is null or char_length("species_variants"."description") between 1 and 50000),
	CONSTRAINT "species_variants_display_order_check" CHECK ("species_variants"."display_order" between 0 and 1000),
	CONSTRAINT "species_variants_definition_types_check" CHECK (jsonb_typeof("species_variants"."feature_grants") = 'array')
);
--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- The composite key of variants needs this index first.
CREATE UNIQUE INDEX "species_id_campaign_unique_idx" ON "species" USING btree ("id","campaign_id");--> statement-breakpoint
ALTER TABLE "species_variants" ADD CONSTRAINT "species_variants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_variants" ADD CONSTRAINT "species_variants_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_variants" ADD CONSTRAINT "species_variants_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_variants" ADD CONSTRAINT "species_variants_species_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_variants" ADD CONSTRAINT "species_variants_species_campaign_fk" FOREIGN KEY ("species_id","campaign_id") REFERENCES "public"."species"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "species_asset_active_unique_idx" ON "species" USING btree ("asset_id") WHERE "species"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "species_campaign_code_active_unique_idx" ON "species" USING btree ("campaign_id","code") WHERE "species"."deleted_at" is null and "species"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "species_campaign_idx" ON "species" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "species_system_code_idx" ON "species" USING btree ("code") WHERE "species"."deleted_at" is null and "species"."campaign_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "species_variants_asset_active_unique_idx" ON "species_variants" USING btree ("asset_id") WHERE "species_variants"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "species_variants_species_code_active_unique_idx" ON "species_variants" USING btree ("species_id","code") WHERE "species_variants"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "species_variants_species_idx" ON "species_variants" USING btree ("species_id");--> statement-breakpoint
CREATE INDEX "species_variants_campaign_idx" ON "species_variants" USING btree ("campaign_id");