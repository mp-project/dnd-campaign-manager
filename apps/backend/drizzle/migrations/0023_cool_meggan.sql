CREATE TYPE "public"."asset_media_role" AS ENUM('COVER', 'GALLERY', 'DOCUMENT', 'MAP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."asset_media_visibility" AS ENUM('GM_ONLY', 'WITH_ASSET');--> statement-breakpoint
CREATE TYPE "public"."media_scope" AS ENUM('SYSTEM', 'CAMPAIGN');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('PENDING', 'READY', 'FAILED', 'QUARANTINED');--> statement-breakpoint
CREATE TABLE "asset_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "asset_media_role" NOT NULL,
	"title" varchar(160),
	"caption" text,
	"alt_text" varchar(500),
	"visibility" "asset_media_visibility" DEFAULT 'GM_ONLY' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_image" boolean DEFAULT false NOT NULL,
	CONSTRAINT "asset_media_display_order_check" CHECK ("asset_media"."display_order" >= 0),
	CONSTRAINT "asset_media_player_image_alt_check" CHECK ("asset_media"."visibility" = 'GM_ONLY' or "asset_media"."is_image" = false or "asset_media"."alt_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid,
	"scope" "media_scope" NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" char(64) NOT NULL,
	"width" integer,
	"height" integer,
	"status" "media_status" DEFAULT 'PENDING' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"title" varchar(160),
	"alt_text" varchar(500),
	"object_deleted_at" timestamp with time zone,
	CONSTRAINT "media_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_files_scope_campaign_check" CHECK (("media_files"."scope" = 'SYSTEM' and "media_files"."campaign_id" is null)
        or ("media_files"."scope" = 'CAMPAIGN' and "media_files"."campaign_id" is not null)),
	CONSTRAINT "media_files_size_check" CHECK ("media_files"."size_bytes" >= 0),
	CONSTRAINT "media_files_sha256_check" CHECK ("media_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "media_files_dimensions_check" CHECK (("media_files"."width" is null or "media_files"."width" > 0) and ("media_files"."height" is null or "media_files"."height" > 0))
);
--> statement-breakpoint
ALTER TABLE "asset_media" ADD CONSTRAINT "asset_media_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_media" ADD CONSTRAINT "asset_media_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_media" ADD CONSTRAINT "asset_media_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_media_asset_media_role_active_unique_idx" ON "asset_media" USING btree ("asset_id","media_id","role") WHERE "asset_media"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_media_primary_active_unique_idx" ON "asset_media" USING btree ("asset_id","role") WHERE "asset_media"."deleted_at" is null and "asset_media"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "asset_media_asset_order_idx" ON "asset_media" USING btree ("asset_id","display_order");--> statement-breakpoint
CREATE INDEX "asset_media_media_idx" ON "asset_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_files_campaign_name_idx" ON "media_files" USING btree ("campaign_id","original_name","id");--> statement-breakpoint
CREATE INDEX "media_files_status_idx" ON "media_files" USING btree ("status","created_at");