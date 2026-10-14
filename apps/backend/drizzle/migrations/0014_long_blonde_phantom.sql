CREATE TYPE "public"."campaign_invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "campaign_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"target_user_id" uuid,
	"role" "campaign_member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"status" "campaign_invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(24) DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_tag" varchar(32) DEFAULT 'player#' || lpad(floor(random() * 1000000)::int::text, 6, '0') NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invitations_token_hash_unique_idx" ON "campaign_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invitations_campaign_email_pending_unique_idx" ON "campaign_invitations" USING btree ("campaign_id","email") WHERE "campaign_invitations"."deleted_at" is null and "campaign_invitations"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "campaign_invitations_target_status_idx" ON "campaign_invitations" USING btree ("target_user_id","status");--> statement-breakpoint
CREATE INDEX "campaign_invitations_campaign_status_idx" ON "campaign_invitations" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_user_tag_unique_idx" ON "users" USING btree ("user_tag");