CREATE TYPE "public"."asset_origin" AS ENUM('DEFAULT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."asset_ruleset_policy" AS ENUM('NEUTRAL', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."asset_scope" AS ENUM('SYSTEM', 'CAMPAIGN');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('NOTE', 'FEATURE', 'CLASS', 'SUBCLASS', 'SPECIES', 'SPECIES_VARIANT', 'FEAT', 'SPELL', 'SPELL_LIST', 'ITEM', 'BACKGROUND', 'MONSTER_DEFINITION', 'PLAYER_CHARACTER', 'NPC', 'MONSTER', 'LOCATION', 'EVENT', 'INTERACTION', 'ENCOUNTER', 'QUEST', 'STORYLINE', 'SESSION');--> statement-breakpoint
CREATE TABLE "asset_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"asset_type" "asset_type" NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(160) NOT NULL,
	CONSTRAINT "asset_families_id_type_unique" UNIQUE("id","asset_type")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"asset_type" "asset_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"summary" varchar(500),
	"status" "asset_status" DEFAULT 'DRAFT' NOT NULL,
	"scope" "asset_scope" NOT NULL,
	"origin" "asset_origin" NOT NULL,
	"campaign_id" uuid,
	"asset_family_id" uuid,
	"ruleset_policy" "asset_ruleset_policy" DEFAULT 'NEUTRAL' NOT NULL,
	"source_reference" jsonb,
	CONSTRAINT "assets_id_campaign_unique" UNIQUE("id","campaign_id"),
	CONSTRAINT "assets_scope_origin_campaign_check" CHECK (("assets"."scope" = 'SYSTEM' and "assets"."origin" = 'DEFAULT' and "assets"."campaign_id" is null)
        or ("assets"."scope" = 'CAMPAIGN' and "assets"."origin" = 'CUSTOM' and "assets"."campaign_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_family_type_fk" FOREIGN KEY ("asset_family_id","asset_type") REFERENCES "public"."asset_families"("id","asset_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_families_type_code_active_unique_idx" ON "asset_families" USING btree ("asset_type","code") WHERE "asset_families"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_campaign_type_slug_active_unique_idx" ON "assets" USING btree ("campaign_id","asset_type","slug") WHERE "assets"."deleted_at" is null and "assets"."scope" = 'CAMPAIGN';--> statement-breakpoint
CREATE UNIQUE INDEX "assets_system_type_slug_active_unique_idx" ON "assets" USING btree ("asset_type","slug") WHERE "assets"."deleted_at" is null and "assets"."scope" = 'SYSTEM';--> statement-breakpoint
CREATE INDEX "assets_campaign_type_idx" ON "assets" USING btree ("campaign_id","asset_type");--> statement-breakpoint
CREATE INDEX "assets_scope_type_idx" ON "assets" USING btree ("scope","asset_type");--> statement-breakpoint
CREATE INDEX "assets_family_idx" ON "assets" USING btree ("asset_family_id");--> statement-breakpoint
-- asset_rulesets previously had no FK and the assets table is new, so existing rows cannot reference an asset.
DELETE FROM "asset_rulesets" WHERE "asset_id" NOT IN (SELECT "id" FROM "assets");--> statement-breakpoint
ALTER TABLE "asset_rulesets" ADD CONSTRAINT "asset_rulesets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_rulesets_ruleset_id_idx" ON "asset_rulesets" USING btree ("ruleset_id");