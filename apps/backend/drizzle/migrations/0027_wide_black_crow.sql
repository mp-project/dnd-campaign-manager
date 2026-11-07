CREATE TYPE "public"."feature_stacking_mode" AS ENUM('NONE', 'STACK', 'HIGHEST', 'REPLACE');--> statement-breakpoint
CREATE TYPE "public"."feature_type" AS ENUM('PASSIVE', 'ACTIVE', 'REACTION', 'RESOURCE', 'RULE');--> statement-breakpoint
CREATE TABLE "features" (
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
	"feature_type" "feature_type" NOT NULL,
	"description" text,
	"stacking_mode" "feature_stacking_mode" DEFAULT 'NONE' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scaling_tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "features_code_format_check" CHECK ("features"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "features_description_length_check" CHECK ("features"."description" is null or char_length("features"."description") between 1 and 50000),
	CONSTRAINT "features_graph_arrays_check" CHECK (jsonb_typeof("features"."sections") = 'array'
        and jsonb_typeof("features"."parameters") = 'array'
        and jsonb_typeof("features"."choices") = 'array'
        and jsonb_typeof("features"."resources") = 'array'
        and jsonb_typeof("features"."scaling_tracks") = 'array'
        and jsonb_typeof("features"."activations") = 'array'
        and jsonb_typeof("features"."effects") = 'array'
        and jsonb_typeof("features"."supersedes") = 'array')
);
--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "features_asset_active_unique_idx" ON "features" USING btree ("asset_id") WHERE "features"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "features_campaign_code_active_unique_idx" ON "features" USING btree ("campaign_id","code") WHERE "features"."deleted_at" is null and "features"."campaign_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "features_system_code_active_unique_idx" ON "features" USING btree ("code") WHERE "features"."deleted_at" is null and "features"."campaign_id" is null;--> statement-breakpoint
CREATE INDEX "features_campaign_idx" ON "features" USING btree ("campaign_id");