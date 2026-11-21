DROP TABLE "auth_attempts" CASCADE;--> statement-breakpoint
DROP TABLE "email_verification_requests" CASCADE;--> statement-breakpoint
DROP TABLE "password_reset_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "refresh_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "trusted_devices" CASCADE;--> statement-breakpoint
DROP INDEX "users_google_subject_active_unique_idx";--> statement-breakpoint
DROP INDEX "users_discord_user_id_active_unique_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_user_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_active_unique_idx" ON "users" USING btree ("clerk_user_id") WHERE "users"."clerk_user_id" is not null and "users"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "google_subject";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "discord_user_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "session_version";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_email";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_email_code_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_email_expires_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "pending_email_attempt_count";--> statement-breakpoint
DROP TYPE "public"."auth_attempt_action";--> statement-breakpoint
DROP TYPE "public"."email_verification_status";--> statement-breakpoint
DROP TYPE "public"."oauth_provider";