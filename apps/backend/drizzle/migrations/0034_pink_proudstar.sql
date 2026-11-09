CREATE TYPE "public"."spell_casting_time_type" AS ENUM('ACTION', 'BONUS_ACTION', 'REACTION', 'MINUTE', 'HOUR');--> statement-breakpoint
CREATE TYPE "public"."spell_duration_type" AS ENUM('INSTANTANEOUS', 'TIMED', 'UNTIL_DISPELLED', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."spell_duration_unit" AS ENUM('ROUND', 'MINUTE', 'HOUR', 'DAY');--> statement-breakpoint
CREATE TYPE "public"."spell_range_type" AS ENUM('SELF', 'TOUCH', 'DISTANCE', 'SIGHT', 'UNLIMITED');--> statement-breakpoint
CREATE TYPE "public"."spell_range_unit" AS ENUM('FEET', 'METERS', 'MILES', 'KILOMETERS');--> statement-breakpoint
CREATE TYPE "public"."spell_school" AS ENUM('ABJURATION', 'CONJURATION', 'DIVINATION', 'ENCHANTMENT', 'EVOCATION', 'ILLUSION', 'NECROMANCY', 'TRANSMUTATION');--> statement-breakpoint
CREATE TABLE "spell_lists" (
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
	"spell_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "spell_lists_code_format_check" CHECK ("spell_lists"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "spell_lists_description_length_check" CHECK ("spell_lists"."description" is null or char_length("spell_lists"."description") between 1 and 50000),
	CONSTRAINT "spell_lists_spell_ids_check" CHECK (case when jsonb_typeof("spell_lists"."spell_ids") = 'array' then jsonb_array_length("spell_lists"."spell_ids") <= 1000 else false end)
);
--> statement-breakpoint
CREATE TABLE "spells" (
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
	"level" integer NOT NULL,
	"school" "spell_school" NOT NULL,
	"description" text,
	"higher_level_description" text,
	"is_ritual" boolean DEFAULT false NOT NULL,
	"casting_time_type" "spell_casting_time_type" NOT NULL,
	"casting_time_amount" integer DEFAULT 1 NOT NULL,
	"casting_trigger" text,
	"range_type" "spell_range_type" NOT NULL,
	"range_distance" integer,
	"range_unit" "spell_range_unit",
	"duration_type" "spell_duration_type" NOT NULL,
	"duration_amount" integer,
	"duration_unit" "spell_duration_unit",
	"requires_concentration" boolean DEFAULT false NOT NULL,
	"component_verbal" boolean DEFAULT false NOT NULL,
	"component_somatic" boolean DEFAULT false NOT NULL,
	"component_material" boolean DEFAULT false NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scaling_tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spell_list_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "spells_code_format_check" CHECK ("spells"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "spells_level_check" CHECK ("spells"."level" between 0 and 9),
	CONSTRAINT "spells_text_length_check" CHECK (("spells"."description" is null or char_length("spells"."description") between 1 and 50000)
        and ("spells"."higher_level_description" is null or char_length("spells"."higher_level_description") between 1 and 50000)),
	CONSTRAINT "spells_ritual_check" CHECK (not "spells"."is_ritual" or "spells"."level" > 0),
	CONSTRAINT "spells_casting_time_check" CHECK ("spells"."casting_time_amount" between 1 and 1000
        and ("spells"."casting_trigger" is not null) = ("spells"."casting_time_type" = 'REACTION')
        and ("spells"."casting_time_type" in ('MINUTE', 'HOUR') or "spells"."casting_time_amount" = 1)),
	CONSTRAINT "spells_range_check" CHECK (("spells"."range_type" = 'DISTANCE') = ("spells"."range_distance" is not null)
        and ("spells"."range_distance" is null) = ("spells"."range_unit" is null)
        and ("spells"."range_distance" is null or "spells"."range_distance" between 1 and 1000000)),
	CONSTRAINT "spells_duration_check" CHECK (("spells"."duration_type" = 'TIMED') = ("spells"."duration_amount" is not null)
        and ("spells"."duration_amount" is null) = ("spells"."duration_unit" is null)
        and ("spells"."duration_amount" is null or "spells"."duration_amount" between 1 and 1000)
        and not ("spells"."requires_concentration" and "spells"."duration_type" = 'INSTANTANEOUS')),
	CONSTRAINT "spells_material_check" CHECK ("spells"."component_material" = (case when jsonb_typeof("spells"."materials") = 'array' then jsonb_array_length("spells"."materials") > 0 else false end)),
	CONSTRAINT "spells_definition_types_check" CHECK (jsonb_typeof("spells"."sections") = 'array'
        and jsonb_typeof("spells"."materials") = 'array'
        and jsonb_typeof("spells"."requirements") = 'array'
        and jsonb_typeof("spells"."targets") = 'array'
        and jsonb_typeof("spells"."choices") = 'array'
        and jsonb_typeof("spells"."scaling_tracks") = 'array'
        and jsonb_typeof("spells"."effects") = 'array'
        and jsonb_typeof("spells"."spell_list_ids") = 'array')
);
--> statement-breakpoint
ALTER TABLE "spell_lists" ADD CONSTRAINT "spell_lists_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_lists" ADD CONSTRAINT "spell_lists_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_lists" ADD CONSTRAINT "spell_lists_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spells" ADD CONSTRAINT "spells_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spells" ADD CONSTRAINT "spells_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spells" ADD CONSTRAINT "spells_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spell_lists_asset_active_unique_idx" ON "spell_lists" USING btree ("asset_id") WHERE "spell_lists"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "spell_lists_campaign_code_active_unique_idx" ON "spell_lists" USING btree ("campaign_id","code") WHERE "spell_lists"."deleted_at" is null and "spell_lists"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "spell_lists_campaign_idx" ON "spell_lists" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "spell_lists_spell_ids_idx" ON "spell_lists" USING gin ("spell_ids");--> statement-breakpoint
CREATE INDEX "spell_lists_system_code_idx" ON "spell_lists" USING btree ("code") WHERE "spell_lists"."deleted_at" is null and "spell_lists"."campaign_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "spells_asset_active_unique_idx" ON "spells" USING btree ("asset_id") WHERE "spells"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "spells_campaign_code_active_unique_idx" ON "spells" USING btree ("campaign_id","code") WHERE "spells"."deleted_at" is null and "spells"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "spells_campaign_idx" ON "spells" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "spells_level_idx" ON "spells" USING btree ("level");--> statement-breakpoint
CREATE INDEX "spells_spell_list_ids_idx" ON "spells" USING gin ("spell_list_ids");--> statement-breakpoint
CREATE INDEX "spells_system_code_idx" ON "spells" USING btree ("code") WHERE "spells"."deleted_at" is null and "spells"."campaign_id" is null;