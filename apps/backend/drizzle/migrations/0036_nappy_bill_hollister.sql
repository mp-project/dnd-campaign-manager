CREATE TABLE "subclasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid,
	"asset_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progression_tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spellcasting" jsonb,
	"spell_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "subclasses_code_format_check" CHECK ("subclasses"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "subclasses_description_length_check" CHECK ("subclasses"."description" is null or char_length("subclasses"."description") between 1 and 50000),
	CONSTRAINT "subclasses_display_order_check" CHECK ("subclasses"."display_order" between 0 and 1000),
	CONSTRAINT "subclasses_definition_types_check" CHECK (jsonb_typeof("subclasses"."levels") = 'array'
        and jsonb_typeof("subclasses"."progression_tracks") = 'array'
        and jsonb_typeof("subclasses"."choices") = 'array'
        and ("subclasses"."spellcasting" is null or jsonb_typeof("subclasses"."spellcasting") = 'object')
        and jsonb_typeof("subclasses"."spell_grants") = 'array')
);
--> statement-breakpoint
ALTER TABLE "asset_references" ADD COLUMN "dependent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subclasses_asset_active_unique_idx" ON "subclasses" USING btree ("asset_id") WHERE "subclasses"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subclasses_system_class_code_active_unique_idx" ON "subclasses" USING btree ("class_id","code") WHERE "subclasses"."deleted_at" is null and "subclasses"."campaign_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subclasses_campaign_class_code_active_unique_idx" ON "subclasses" USING btree ("campaign_id","class_id","code") WHERE "subclasses"."deleted_at" is null and "subclasses"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "subclasses_class_idx" ON "subclasses" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "subclasses_campaign_idx" ON "subclasses" USING btree ("campaign_id");--> statement-breakpoint
-- Subclasses now name their class, so the SUBCLASS choice of a class lists no options any more:
-- drop stored options and keep the choice open to subclasses through its filter. The reference
-- index drops the old option references when it is rebuilt (CONTENT_REFERENCE_INDEX_VERSION 2).
UPDATE "classes" SET "choices" = (
  SELECT jsonb_agg(
    CASE WHEN choice ->> 'choiceType' = 'SUBCLASS' THEN
      jsonb_set(
        jsonb_set(choice, '{options}', '[]'::jsonb),
        '{optionFilter}',
        CASE WHEN jsonb_typeof(choice -> 'optionFilter') = 'object'
          THEN choice -> 'optionFilter'
          ELSE '{"assetTypes":["SUBCLASS"]}'::jsonb
        END
      )
    ELSE choice END
    ORDER BY position
  )
  FROM jsonb_array_elements("classes"."choices") WITH ORDINALITY AS entries(choice, position)
)
WHERE jsonb_path_exists("choices", '$[*] ? (@.choiceType == "SUBCLASS" && @.options.size() > 0)');
