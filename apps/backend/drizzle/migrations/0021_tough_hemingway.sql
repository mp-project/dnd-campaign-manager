CREATE TABLE "asset_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"relation_type" varchar(80) NOT NULL,
	"label" varchar(160),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	CONSTRAINT "asset_links_sort_order_check" CHECK ("asset_links"."sort_order" >= 0),
	CONSTRAINT "asset_links_metadata_object_check" CHECK (jsonb_typeof("asset_links"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_source_campaign_fk" FOREIGN KEY ("source_asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_links_active_unique_idx" ON "asset_links" USING btree ("campaign_id","source_asset_id","target_asset_id","relation_type") WHERE "asset_links"."deleted_at" is null and "asset_links"."allow_multiple" = false;--> statement-breakpoint
CREATE INDEX "asset_links_source_idx" ON "asset_links" USING btree ("campaign_id","source_asset_id","sort_order");--> statement-breakpoint
CREATE INDEX "asset_links_target_idx" ON "asset_links" USING btree ("target_asset_id","campaign_id");