CREATE UNIQUE INDEX IF NOT EXISTS "users_single_system_user_active_unique_idx"
ON "users" USING btree ("system_role")
WHERE "users"."system_role" = 'SYSTEM' and "users"."deleted_at" is null;
--> statement-breakpoint
INSERT INTO "users" (
	"id",
	"version",
	"created_at",
	"updated_at",
	"deleted_at",
	"created_by",
	"updated_by",
	"email",
	"password_hash",
	"display_name",
	"system_role",
	"status",
	"email_verified_at",
	"last_login_at"
)
SELECT
	'00000000-0000-4000-8000-000000000001'::uuid,
	1,
	now(),
	now(),
	null,
	'00000000-0000-4000-8000-000000000001'::uuid,
	'00000000-0000-4000-8000-000000000001'::uuid,
	'system@local.invalid',
	'scrypt$systemuserseed0001$18821a0aa7c6562c672feb8053fc4dc064f846aa18b733ae7ee372c3538ad3aa21d59037cb41b8548f4d00e40e3cf67cf84832cccc8d73707ba320979fe1efc7',
	'SYSTEM',
	'SYSTEM',
	'ACTIVE',
	now(),
	null
WHERE NOT EXISTS (
	SELECT 1
	FROM "users"
	WHERE "system_role" = 'SYSTEM'
		AND "deleted_at" is null
);