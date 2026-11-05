CREATE TYPE "public"."note_content_format" AS ENUM('MARKDOWN', 'PLAIN_TEXT');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('GM_NOTE', 'HANDOUT', 'LORE', 'EXPLANATION', 'PLAYER_SECRET');--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"note_type" "note_type" NOT NULL,
	"content_format" "note_content_format" DEFAULT 'MARKDOWN' NOT NULL,
	"content" text NOT NULL,
	"gm_notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "notes_sort_order_check" CHECK ("notes"."sort_order" >= 0),
	CONSTRAINT "notes_content_length_check" CHECK (char_length("notes"."content") <= 100000),
	CONSTRAINT "notes_gm_notes_length_check" CHECK ("notes"."gm_notes" is null or char_length("notes"."gm_notes") between 1 and 20000)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_asset_active_unique_idx" ON "notes" USING btree ("asset_id") WHERE "notes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notes_campaign_sort_idx" ON "notes" USING btree ("campaign_id","sort_order","id");