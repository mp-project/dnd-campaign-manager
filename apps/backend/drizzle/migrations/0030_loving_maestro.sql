CREATE TYPE "public"."class_hit_die" AS ENUM('D6', 'D8', 'D10', 'D12');--> statement-breakpoint
CREATE TABLE "classes" (
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
	"maximum_level" integer DEFAULT 20 NOT NULL,
	"hit_die" "class_hit_die" NOT NULL,
	"first_level_hit_points" integer NOT NULL,
	"fixed_hit_points_per_level" integer NOT NULL,
	"subclass_selection_level" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"primary_abilities" jsonb NOT NULL,
	"proficiencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starting_equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progression_tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spellcasting" jsonb,
	"multiclass" jsonb NOT NULL,
	CONSTRAINT "classes_code_format_check" CHECK ("classes"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "classes_description_length_check" CHECK ("classes"."description" is null or char_length("classes"."description") between 1 and 50000),
	CONSTRAINT "classes_levels_check" CHECK ("classes"."maximum_level" between 1 and 20
        and "classes"."subclass_selection_level" between 1 and "classes"."maximum_level"),
	CONSTRAINT "classes_hit_points_check" CHECK ("classes"."first_level_hit_points" between 1 and 100
        and "classes"."fixed_hit_points_per_level" between 1 and 100),
	CONSTRAINT "classes_display_order_check" CHECK ("classes"."display_order" between 0 and 1000),
	CONSTRAINT "classes_definition_types_check" CHECK (jsonb_typeof("classes"."primary_abilities") = 'object'
        and jsonb_typeof("classes"."proficiencies") = 'array'
        and jsonb_typeof("classes"."starting_equipment") = 'array'
        and jsonb_typeof("classes"."progression_tracks") = 'array'
        and jsonb_typeof("classes"."levels") = 'array'
        and jsonb_typeof("classes"."choices") = 'array'
        and ("classes"."spellcasting" is null or jsonb_typeof("classes"."spellcasting") = 'object')
        and jsonb_typeof("classes"."multiclass") = 'object'),
	CONSTRAINT "classes_level_count_check" CHECK (jsonb_array_length("classes"."levels") = "classes"."maximum_level")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_asset_active_unique_idx" ON "classes" USING btree ("asset_id") WHERE "classes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_campaign_code_active_unique_idx" ON "classes" USING btree ("campaign_id","code") WHERE "classes"."deleted_at" is null and "classes"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "classes_campaign_idx" ON "classes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "classes_system_code_idx" ON "classes" USING btree ("code") WHERE "classes"."deleted_at" is null and "classes"."campaign_id" is null;