CREATE TABLE "system_runtime_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_runtime_state_state_key_active_unique_idx" ON "system_runtime_state" USING btree ("state_key") WHERE "system_runtime_state"."deleted_at" is null;