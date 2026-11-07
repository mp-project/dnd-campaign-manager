ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_code_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_attempt_count" integer DEFAULT 0 NOT NULL;