UPDATE "asset_rulesets"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "campaign_runtime_state"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "email_verification_requests"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "ruleset_level_progressions"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "ruleset_spell_slot_progressions"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "rulesets"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "system_runtime_state"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "user_settings"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
UPDATE "users"
SET "created_by" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "created_by" is null;
--> statement-breakpoint
ALTER TABLE "asset_rulesets" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "asset_rulesets" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_runtime_state" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "campaign_runtime_state" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_verification_requests" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "email_verification_requests" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ruleset_level_progressions" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "ruleset_level_progressions" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ruleset_spell_slot_progressions" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "ruleset_spell_slot_progressions" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rulesets" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "rulesets" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "system_runtime_state" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "system_runtime_state" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_by" SET DEFAULT '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint