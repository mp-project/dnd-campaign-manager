CREATE TYPE "public"."user_system_role_new" AS ENUM('SYSTEM', 'SUPER_ADMIN', 'ADMIN', 'USER');
--> statement-breakpoint
ALTER TABLE "users"
ALTER COLUMN "system_role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "users"
ALTER COLUMN "system_role" TYPE "public"."user_system_role_new"
USING ("system_role"::text::"public"."user_system_role_new");
--> statement-breakpoint
DROP TYPE "public"."user_system_role";
--> statement-breakpoint
ALTER TYPE "public"."user_system_role_new" RENAME TO "user_system_role";
--> statement-breakpoint
ALTER TABLE "users"
ALTER COLUMN "system_role" SET DEFAULT 'USER';