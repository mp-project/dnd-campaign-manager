CREATE TABLE "asset_references" (
	"source_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"path" varchar(500) NOT NULL,
	"kind" varchar(60) NOT NULL,
	"forbids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_references_pk" PRIMARY KEY("source_asset_id","path")
);
--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_references_target_idx" ON "asset_references" USING btree ("target_asset_id");