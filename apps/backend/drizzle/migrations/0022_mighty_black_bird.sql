CREATE TABLE "asset_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"normalized_name" varchar(80) NOT NULL,
	"color" varchar(9),
	"description" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tags_id_campaign_unique" UNIQUE("id","campaign_id"),
	CONSTRAINT "tags_sort_order_check" CHECK ("tags"."sort_order" >= 0),
	CONSTRAINT "tags_normalized_name_check" CHECK (length("tags"."normalized_name") > 0),
	CONSTRAINT "tags_color_check" CHECK ("tags"."color" is null or "tags"."color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
);
--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_campaign_fk" FOREIGN KEY ("tag_id","campaign_id") REFERENCES "public"."tags"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_tags_asset_tag_active_unique_idx" ON "asset_tags" USING btree ("asset_id","tag_id") WHERE "asset_tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_tags_tag_idx" ON "asset_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_campaign_normalized_name_active_unique_idx" ON "tags" USING btree ("campaign_id","normalized_name") WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tags_campaign_sort_idx" ON "tags" USING btree ("campaign_id","sort_order","id");