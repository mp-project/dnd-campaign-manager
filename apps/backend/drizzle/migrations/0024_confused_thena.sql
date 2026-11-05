CREATE TYPE "public"."media_upload_status" AS ENUM('ACTIVE', 'COMPLETING');--> statement-breakpoint
CREATE TYPE "public"."media_variant_kind" AS ENUM('THUMBNAIL', 'DISPLAY');--> statement-breakpoint
CREATE TYPE "public"."media_variant_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"storage_upload_id" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"part_size_bytes" integer NOT NULL,
	"status" "media_upload_status" DEFAULT 'ACTIVE' NOT NULL,
	"title" varchar(160),
	"alt_text" varchar(500),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_uploads_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_uploads_size_check" CHECK ("media_uploads"."size_bytes" > 0),
	CONSTRAINT "media_uploads_part_size_check" CHECK ("media_uploads"."part_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"media_id" uuid NOT NULL,
	"kind" "media_variant_kind" NOT NULL,
	"status" "media_variant_status" DEFAULT 'PENDING' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint,
	"width" integer,
	"height" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "media_variants_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_uploads_campaign_idx" ON "media_uploads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "media_uploads_expires_idx" ON "media_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_variants_media_kind_unique_idx" ON "media_variants" USING btree ("media_id","kind");--> statement-breakpoint
CREATE INDEX "media_variants_status_idx" ON "media_variants" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "media_files_quota_idx" ON "media_files" USING btree ("campaign_id","status") WHERE "media_files"."deleted_at" is null;