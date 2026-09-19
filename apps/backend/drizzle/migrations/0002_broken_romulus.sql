CREATE TYPE "public"."asset_ruleset_compatibility" AS ENUM('SUPPORTED', 'NEUTRAL');--> statement-breakpoint
CREATE TYPE "public"."ruleset_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "asset_rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"asset_id" uuid NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"compatibility" "asset_ruleset_compatibility" DEFAULT 'SUPPORTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleset_level_progressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"ruleset_id" uuid NOT NULL,
	"character_level" smallint NOT NULL,
	"proficiency_bonus" smallint NOT NULL,
	"experience_threshold" integer,
	CONSTRAINT "ruleset_level_progressions_character_level_check" CHECK ("ruleset_level_progressions"."character_level" between 1 and 20),
	CONSTRAINT "ruleset_level_progressions_proficiency_bonus_check" CHECK ("ruleset_level_progressions"."proficiency_bonus" >= 1),
	CONSTRAINT "ruleset_level_progressions_experience_threshold_check" CHECK ("ruleset_level_progressions"."experience_threshold" is null or "ruleset_level_progressions"."experience_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ruleset_spell_slot_progressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"ruleset_id" uuid NOT NULL,
	"caster_level" smallint NOT NULL,
	"slot_level" smallint NOT NULL,
	"slot_count" smallint NOT NULL,
	CONSTRAINT "ruleset_spell_slot_progressions_caster_level_check" CHECK ("ruleset_spell_slot_progressions"."caster_level" between 1 and 20),
	CONSTRAINT "ruleset_spell_slot_progressions_slot_level_check" CHECK ("ruleset_spell_slot_progressions"."slot_level" between 1 and 9),
	CONSTRAINT "ruleset_spell_slot_progressions_slot_count_check" CHECK ("ruleset_spell_slot_progressions"."slot_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"status" "ruleset_status" DEFAULT 'ACTIVE' NOT NULL,
	"edition_year" integer NOT NULL,
	"source_reference" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"license_code" varchar(80) NOT NULL,
	"attribution" text,
	CONSTRAINT "rulesets_edition_year_check" CHECK ("rulesets"."edition_year" between 1900 and 3000)
);
--> statement-breakpoint
ALTER TABLE "asset_rulesets" ADD CONSTRAINT "asset_rulesets_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleset_level_progressions" ADD CONSTRAINT "ruleset_level_progressions_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleset_spell_slot_progressions" ADD CONSTRAINT "ruleset_spell_slot_progressions_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_rulesets_asset_ruleset_active_unique_idx" ON "asset_rulesets" USING btree ("asset_id","ruleset_id") WHERE "asset_rulesets"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_level_progressions_ruleset_level_active_unique_idx" ON "ruleset_level_progressions" USING btree ("ruleset_id","character_level") WHERE "ruleset_level_progressions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_spell_slot_progressions_ruleset_caster_slot_active_unique_idx" ON "ruleset_spell_slot_progressions" USING btree ("ruleset_id","caster_level","slot_level") WHERE "ruleset_spell_slot_progressions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "rulesets_code_active_unique_idx" ON "rulesets" USING btree ("code") WHERE "rulesets"."deleted_at" is null and "rulesets"."status" = 'ACTIVE';