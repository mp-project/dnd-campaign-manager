CREATE TYPE "public"."email_verification_status" AS ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "email_verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"email" varchar(320) NOT NULL,
	"code_hash" text NOT NULL,
	"status" "email_verification_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_verification_requests_email_idx" ON "email_verification_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_verification_requests_status_idx" ON "email_verification_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_requests_pending_email_unique_idx" ON "email_verification_requests" USING btree ("email") WHERE "email_verification_requests"."status" = 'PENDING' and "email_verification_requests"."deleted_at" is null;