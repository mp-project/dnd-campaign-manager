CREATE TYPE "public"."actor_alignment" AS ENUM('LAWFUL_GOOD', 'NEUTRAL_GOOD', 'CHAOTIC_GOOD', 'LAWFUL_NEUTRAL', 'NEUTRAL', 'CHAOTIC_NEUTRAL', 'LAWFUL_EVIL', 'NEUTRAL_EVIL', 'CHAOTIC_EVIL', 'UNALIGNED', 'ANY');--> statement-breakpoint
CREATE TYPE "public"."actor_category" AS ENUM('PLAYER_CHARACTER', 'NPC', 'MONSTER');--> statement-breakpoint
CREATE TYPE "public"."actor_creature_type" AS ENUM('ABERRATION', 'BEAST', 'CELESTIAL', 'CONSTRUCT', 'DRAGON', 'ELEMENTAL', 'FEY', 'FIEND', 'GIANT', 'HUMANOID', 'MONSTROSITY', 'OOZE', 'PLANT', 'UNDEAD');--> statement-breakpoint
CREATE TYPE "public"."actor_size" AS ENUM('TINY', 'SMALL', 'MEDIUM', 'LARGE', 'HUGE', 'GARGANTUAN');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"category" "actor_category" NOT NULL,
	"display_name" varchar(160),
	"size" "actor_size" DEFAULT 'MEDIUM' NOT NULL,
	"creature_type" "actor_creature_type",
	"creature_subtype" varchar(80),
	"alignment" "actor_alignment",
	"description" text,
	"notes" text,
	"gm_notes" text,
	"abilities" jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proficiencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"senses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"speeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"defenses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"combat" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"personality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wallet" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"loot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "actors_abilities_check" CHECK (jsonb_typeof("actors"."abilities") = 'object'
        and "actors"."abilities" ?& array['str', 'dex', 'con', 'int', 'wis', 'cha']),
	CONSTRAINT "actors_list_parts_check" CHECK (jsonb_typeof("actors"."skills") = 'array' and jsonb_typeof("actors"."proficiencies") = 'array' and jsonb_typeof("actors"."languages") = 'array' and jsonb_typeof("actors"."senses") = 'array' and jsonb_typeof("actors"."speeds") = 'array' and jsonb_typeof("actors"."defenses") = 'array' and jsonb_typeof("actors"."traits") = 'array' and jsonb_typeof("actors"."loot") = 'array'),
	CONSTRAINT "actors_object_parts_check" CHECK (jsonb_typeof("actors"."combat") = 'object' and jsonb_typeof("actors"."appearance") = 'object'
        and jsonb_typeof("actors"."personality") = 'object' and jsonb_typeof("actors"."wallet") = 'object'),
	CONSTRAINT "actors_display_name_check" CHECK ("actors"."display_name" is null or char_length(trim("actors"."display_name")) > 0),
	CONSTRAINT "actors_creature_subtype_check" CHECK ("actors"."creature_subtype" is null or char_length(trim("actors"."creature_subtype")) > 0),
	CONSTRAINT "actors_texts_check" CHECK (("actors"."description" is null or char_length("actors"."description") between 1 and 50000)
        and ("actors"."notes" is null or char_length("actors"."notes") between 1 and 20000)
        and ("actors"."gm_notes" is null or char_length("actors"."gm_notes") between 1 and 20000))
);
--> statement-breakpoint
-- Characters, NPCs and monsters become one asset type ACTOR; FACTION is added as a placeholder.
-- Both columns of the composite foreign key change type, so the key is dropped and added again.
ALTER TABLE "assets" DROP CONSTRAINT "assets_family_type_fk";--> statement-breakpoint
ALTER TABLE "asset_families" ALTER COLUMN "asset_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "asset_type" SET DATA TYPE text;--> statement-breakpoint
-- Existing assets of the old types become actors; a name taken by another of them gets a suffix,
-- because the old types no longer keep them apart.
UPDATE "asset_families" AS f
SET "asset_type" = 'ACTOR',
	"code" = CASE WHEN EXISTS (
		SELECT 1 FROM "asset_families" AS o
		WHERE o."id" <> f."id" AND o."deleted_at" IS NULL AND o."code" = f."code"
			AND o."asset_type" IN ('PLAYER_CHARACTER', 'NPC', 'MONSTER')
	) THEN left(f."code", 90) || '-' || left(f."id"::text, 8) ELSE f."code" END
WHERE f."asset_type" IN ('PLAYER_CHARACTER', 'NPC', 'MONSTER');--> statement-breakpoint
UPDATE "assets" AS a
SET "asset_type" = 'ACTOR',
	"slug" = CASE WHEN EXISTS (
		SELECT 1 FROM "assets" AS o
		WHERE o."id" <> a."id" AND o."deleted_at" IS NULL AND o."slug" = a."slug"
			AND o."scope" = a."scope" AND o."campaign_id" IS NOT DISTINCT FROM a."campaign_id"
			AND o."asset_type" IN ('PLAYER_CHARACTER', 'NPC', 'MONSTER')
	) THEN left(a."slug", 90) || '-' || left(a."id"::text, 8) ELSE a."slug" END
WHERE a."asset_type" IN ('PLAYER_CHARACTER', 'NPC', 'MONSTER');--> statement-breakpoint
DROP TYPE "public"."asset_type";--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('NOTE', 'FEATURE', 'CLASS', 'SUBCLASS', 'SPECIES', 'SPECIES_VARIANT', 'FEAT', 'SPELL', 'SPELL_LIST', 'ITEM', 'BACKGROUND', 'MONSTER_DEFINITION', 'ACTOR', 'FACTION', 'LOCATION', 'EVENT', 'INTERACTION', 'ENCOUNTER', 'QUEST', 'STORYLINE', 'SESSION');--> statement-breakpoint
ALTER TABLE "asset_families" ALTER COLUMN "asset_type" SET DATA TYPE "public"."asset_type" USING "asset_type"::"public"."asset_type";--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "asset_type" SET DATA TYPE "public"."asset_type" USING "asset_type"::"public"."asset_type";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_family_type_fk" FOREIGN KEY ("asset_family_id","asset_type") REFERENCES "public"."asset_families"("id","asset_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actors_asset_active_unique_idx" ON "actors" USING btree ("asset_id") WHERE "actors"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "actors_campaign_category_idx" ON "actors" USING btree ("campaign_id","category") WHERE "actors"."deleted_at" is null;