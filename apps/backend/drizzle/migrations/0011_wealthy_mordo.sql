ALTER TABLE "users" ALTER COLUMN "system_role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "system_role" SET DEFAULT 'USER'::text;--> statement-breakpoint
UPDATE "users"
SET "system_role" = 'SYSTEM_MAINTAINER'
WHERE "system_role" = 'SUPER_ADMIN';--> statement-breakpoint
DROP TYPE "public"."user_system_role";--> statement-breakpoint
CREATE TYPE "public"."user_system_role" AS ENUM('SYSTEM', 'SYSTEM_MAINTAINER', 'ADMIN', 'USER');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "system_role" SET DEFAULT 'USER'::"public"."user_system_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "system_role" SET DATA TYPE "public"."user_system_role" USING "system_role"::"public"."user_system_role";--> statement-breakpoint
ALTER TABLE "asset_rulesets" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "campaign_runtime_state" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "campaign_time_events" ALTER COLUMN "created_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "created_by" DROP DEFAULT;