CREATE TYPE "public"."auth_attempt_action" AS ENUM('LOGIN', 'REFRESH', 'EMAIL_VERIFICATION', 'AUTH_EMAIL');--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"action" "auth_attempt_action" NOT NULL,
	"count" integer NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "auth_attempts_window_expires_at_idx" ON "auth_attempts" USING btree ("window_expires_at");