CREATE TYPE "public"."content_share_audience" AS ENUM('ALL_PLAYERS', 'SELECTED_PLAYERS');--> statement-breakpoint
CREATE TABLE "content_share_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"content_share_id" uuid NOT NULL,
	"campaign_membership_id" uuid NOT NULL,
	CONSTRAINT "content_share_recipients_share_member_unique" UNIQUE("content_share_id","campaign_membership_id")
);
--> statement-breakpoint
CREATE TABLE "content_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"audience" "content_share_audience" NOT NULL,
	"shared_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "content_shares_asset_campaign_unique" UNIQUE("asset_id","campaign_id"),
	CONSTRAINT "content_shares_expires_check" CHECK ("content_shares"."expires_at" is null or "content_shares"."expires_at" > "content_shares"."created_at")
);
--> statement-breakpoint
ALTER TABLE "content_share_recipients" ADD CONSTRAINT "content_share_recipients_content_share_id_content_shares_id_fk" FOREIGN KEY ("content_share_id") REFERENCES "public"."content_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_share_recipients" ADD CONSTRAINT "content_share_recipients_campaign_membership_id_campaign_memberships_id_fk" FOREIGN KEY ("campaign_membership_id") REFERENCES "public"."campaign_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_shares" ADD CONSTRAINT "content_shares_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_shares" ADD CONSTRAINT "content_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_share_recipients_member_idx" ON "content_share_recipients" USING btree ("campaign_membership_id");--> statement-breakpoint
CREATE INDEX "content_shares_campaign_shared_idx" ON "content_shares" USING btree ("campaign_id","shared_at","id");--> statement-breakpoint
CREATE INDEX "content_shares_expires_idx" ON "content_shares" USING btree ("expires_at");