DROP INDEX "campaign_invitations_campaign_email_pending_unique_idx";--> statement-breakpoint
-- Pending invitations from before this change named the account also when they went by email
-- address; tag and email invitations can no longer be told apart, so they count as invitations by
-- email again (the old index kept one pending invitation per address, so none collide).
UPDATE "campaign_invitations" SET "target_user_id" = NULL WHERE "status" = 'PENDING' AND "deleted_at" IS NULL AND "target_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invitations_campaign_target_pending_unique_idx" ON "campaign_invitations" USING btree ("campaign_id","target_user_id") WHERE "campaign_invitations"."deleted_at" is null and "campaign_invitations"."status" = 'PENDING' and "campaign_invitations"."target_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invitations_campaign_email_pending_unique_idx" ON "campaign_invitations" USING btree ("campaign_id","email") WHERE "campaign_invitations"."deleted_at" is null and "campaign_invitations"."status" = 'PENDING' and "campaign_invitations"."target_user_id" is null;