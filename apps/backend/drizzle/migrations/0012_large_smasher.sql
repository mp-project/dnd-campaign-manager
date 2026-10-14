CREATE TYPE "public"."campaign_membership_status" AS ENUM('PENDING', 'ACTIVE', 'REVOKED');--> statement-breakpoint
DROP INDEX "campaign_memberships_campaign_user_active_unique_idx";--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD COLUMN "status" "campaign_membership_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_memberships_campaign_user_active_unique_idx" ON "campaign_memberships" USING btree ("campaign_id","user_id") WHERE "campaign_memberships"."deleted_at" is null and "campaign_memberships"."status" in ('PENDING', 'ACTIVE');--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_status_timestamps_check" CHECK (("campaign_memberships"."status" = 'PENDING' and "campaign_memberships"."joined_at" is null and "campaign_memberships"."revoked_at" is null and "campaign_memberships"."revoked_by" is null)
        or ("campaign_memberships"."status" = 'ACTIVE' and "campaign_memberships"."joined_at" is not null and "campaign_memberships"."revoked_at" is null and "campaign_memberships"."revoked_by" is null)
        or ("campaign_memberships"."status" = 'REVOKED' and "campaign_memberships"."revoked_at" is not null));