CREATE TYPE "public"."item_ability" AS ENUM('str', 'dex', 'con', 'int', 'wis', 'cha');--> statement-breakpoint
CREATE TYPE "public"."item_armor_category" AS ENUM('LIGHT', 'MEDIUM', 'HEAVY', 'SHIELD');--> statement-breakpoint
CREATE TYPE "public"."item_attunement_mode" AS ENUM('NONE', 'OPTIONAL', 'REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."item_capacity_unit" AS ENUM('CUBIC_FEET', 'GALLONS', 'PINTS', 'PIECES');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('WEAPON', 'ARMOR', 'SHIELD', 'TOOL', 'ADVENTURING_GEAR', 'CONTAINER', 'CONSUMABLE', 'MOUNT', 'VEHICLE', 'TREASURE', 'MAGIC_ITEM', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."item_condition" AS ENUM('PRISTINE', 'WORN', 'DAMAGED', 'BROKEN', 'DESTROYED');--> statement-breakpoint
CREATE TYPE "public"."item_currency" AS ENUM('CP', 'SP', 'EP', 'GP', 'PP');--> statement-breakpoint
CREATE TYPE "public"."item_damage_type" AS ENUM('ACID', 'BLUDGEONING', 'COLD', 'FIRE', 'FORCE', 'LIGHTNING', 'NECROTIC', 'PIERCING', 'POISON', 'PSYCHIC', 'RADIANT', 'SLASHING', 'THUNDER');--> statement-breakpoint
CREATE TYPE "public"."item_dexterity_mode" AS ENUM('FULL', 'CAPPED', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."item_knowledge_level" AS ENUM('UNKNOWN', 'SEEN', 'IDENTIFIED');--> statement-breakpoint
CREATE TYPE "public"."item_magic_type" AS ENUM('ARMOR', 'POTION', 'RING', 'ROD', 'SCROLL', 'STAFF', 'WAND', 'WEAPON', 'WONDROUS_ITEM');--> statement-breakpoint
CREATE TYPE "public"."item_owner_type" AS ENUM('UNASSIGNED', 'ACTOR', 'LOCATION', 'QUEST', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."item_rarity" AS ENUM('COMMON', 'UNCOMMON', 'RARE', 'VERY_RARE', 'LEGENDARY', 'ARTIFACT', 'VARIES');--> statement-breakpoint
CREATE TYPE "public"."item_tool_category" AS ENUM('ARTISANS_TOOLS', 'GAMING_SET', 'MUSICAL_INSTRUMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."item_weapon_category" AS ENUM('SIMPLE', 'MARTIAL');--> statement-breakpoint
CREATE TYPE "public"."item_weapon_combat_type" AS ENUM('MELEE', 'RANGED');--> statement-breakpoint
CREATE TYPE "public"."item_weapon_mastery" AS ENUM('CLEAVE', 'GRAZE', 'NICK', 'PUSH', 'SAP', 'SLOW', 'TOPPLE', 'VEX');--> statement-breakpoint
CREATE TABLE "item_instance_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"user_id" uuid,
	"knowledge_level" "item_knowledge_level" NOT NULL,
	"known_name" varchar(200),
	"known_description" text,
	CONSTRAINT "item_instance_knowledge_text_check" CHECK (("item_instance_knowledge"."known_name" is null or char_length("item_instance_knowledge"."known_name") >= 1)
        and ("item_instance_knowledge"."known_description" is null or char_length("item_instance_knowledge"."known_description") between 1 and 50000))
);
--> statement-breakpoint
CREATE TABLE "item_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid NOT NULL,
	"item_asset_id" uuid NOT NULL,
	"custom_name" varchar(200),
	"quantity" integer DEFAULT 1 NOT NULL,
	"owner_type" "item_owner_type" DEFAULT 'UNASSIGNED' NOT NULL,
	"owner_asset_id" uuid,
	"condition" "item_condition" DEFAULT 'PRISTINE' NOT NULL,
	"current_charges" integer,
	"equipped" boolean DEFAULT false NOT NULL,
	"attuned" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "item_instances_quantity_check" CHECK ("item_instances"."quantity" between 1 and 1000000),
	CONSTRAINT "item_instances_owner_check" CHECK (("item_instances"."owner_type" = 'UNASSIGNED') = ("item_instances"."owner_asset_id" is null)
        and ("item_instances"."owner_type" = 'ACTOR' or (not "item_instances"."equipped" and not "item_instances"."attuned"))),
	CONSTRAINT "item_instances_charges_check" CHECK ("item_instances"."current_charges" is null or "item_instances"."current_charges" between 0 and 1000),
	CONSTRAINT "item_instances_text_check" CHECK (("item_instances"."custom_name" is null or char_length("item_instances"."custom_name") >= 1)
        and ("item_instances"."notes" is null or char_length("item_instances"."notes") between 1 and 50000))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"updated_by" uuid,
	"campaign_id" uuid,
	"asset_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"category" "item_category" NOT NULL,
	"description" text,
	"gm_notes" text,
	"cost_amount" integer,
	"cost_currency" "item_currency",
	"weight" numeric(10, 2),
	"is_magical" boolean DEFAULT false NOT NULL,
	"is_stackable" boolean DEFAULT false NOT NULL,
	"consumed_on_use" boolean DEFAULT false NOT NULL,
	"weapon_category" "item_weapon_category",
	"weapon_combat_type" "item_weapon_combat_type",
	"damage_dice_count" integer,
	"damage_dice_faces" integer,
	"damage_fixed" integer,
	"damage_type" "item_damage_type",
	"versatile_dice_faces" integer,
	"weapon_properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"range_normal" integer,
	"range_long" integer,
	"mastery_property" "item_weapon_mastery",
	"armor_category" "item_armor_category",
	"base_armor_class" integer,
	"dexterity_mode" "item_dexterity_mode",
	"dexterity_cap" integer,
	"strength_requirement" integer,
	"stealth_disadvantage" boolean DEFAULT false NOT NULL,
	"tool_category" "item_tool_category",
	"tool_ability" "item_ability",
	"tool_uses" text,
	"capacity_value" numeric(10, 2),
	"capacity_unit" "item_capacity_unit",
	"capacity_weight" numeric(10, 2),
	"magic_bonus" integer DEFAULT 0 NOT NULL,
	"magic_item_type" "item_magic_type",
	"rarity" "item_rarity",
	"attunement_mode" "item_attunement_mode" DEFAULT 'NONE' NOT NULL,
	"attunement_prerequisite" text,
	"charges_maximum" integer,
	"recharge" jsonb,
	"sentience" jsonb,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spells" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forked_from_asset_id" uuid,
	CONSTRAINT "items_code_format_check" CHECK ("items"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "items_text_length_check" CHECK (("items"."description" is null or char_length("items"."description") between 1 and 50000)
        and ("items"."gm_notes" is null or char_length("items"."gm_notes") between 1 and 50000)
        and ("items"."tool_uses" is null or char_length("items"."tool_uses") between 1 and 50000)
        and ("items"."attunement_prerequisite" is null or char_length("items"."attunement_prerequisite") between 1 and 500)),
	CONSTRAINT "items_cost_check" CHECK (("items"."cost_amount" is null) = ("items"."cost_currency" is null)
        and ("items"."cost_amount" is null or "items"."cost_amount" between 0 and 100000000)
        and ("items"."weight" is null or "items"."weight" between 0 and 100000)),
	CONSTRAINT "items_weapon_check" CHECK (case when "items"."category" = 'WEAPON' then
          "items"."weapon_category" is not null and "items"."weapon_combat_type" is not null
        else
          "items"."weapon_category" is null and "items"."weapon_combat_type" is null
          and "items"."damage_dice_count" is null and "items"."damage_fixed" is null and "items"."damage_type" is null
          and "items"."versatile_dice_faces" is null and "items"."range_normal" is null
          and "items"."mastery_property" is null and "items"."weapon_properties" = '[]'::jsonb
        end
        and ("items"."damage_dice_count" is null) = ("items"."damage_dice_faces" is null)
        and ("items"."damage_dice_count" is null or "items"."damage_fixed" is null)
        and ("items"."damage_type" is not null) = ("items"."damage_dice_count" is not null or "items"."damage_fixed" is not null)
        and ("items"."damage_dice_count" is null or "items"."damage_dice_count" between 1 and 20)
        and ("items"."damage_dice_faces" is null or "items"."damage_dice_faces" in (2, 3, 4, 6, 8, 10, 12, 20, 100))
        and ("items"."versatile_dice_faces" is null or "items"."versatile_dice_faces" in (2, 3, 4, 6, 8, 10, 12, 20, 100))
        and ("items"."damage_fixed" is null or "items"."damage_fixed" between 1 and 100)
        and ("items"."range_normal" is null) = ("items"."range_long" is null)
        and ("items"."range_normal" is null or ("items"."range_normal" between 1 and 10000 and "items"."range_long" between "items"."range_normal" and 10000))),
	CONSTRAINT "items_armor_check" CHECK (case when "items"."category" in ('ARMOR', 'SHIELD') then
          "items"."armor_category" is not null and "items"."base_armor_class" is not null and "items"."dexterity_mode" is not null
          and ("items"."category" = 'SHIELD') = ("items"."armor_category" = 'SHIELD')
        else
          "items"."armor_category" is null and "items"."base_armor_class" is null and "items"."dexterity_mode" is null
          and "items"."strength_requirement" is null and not "items"."stealth_disadvantage"
        end
        and ("items"."dexterity_cap" is not null) = ("items"."dexterity_mode" is not distinct from 'CAPPED')
        and ("items"."base_armor_class" is null or "items"."base_armor_class" between 0 and 30)
        and ("items"."dexterity_cap" is null or "items"."dexterity_cap" between 0 and 10)
        and ("items"."strength_requirement" is null or "items"."strength_requirement" between 1 and 30)),
	CONSTRAINT "items_tool_check" CHECK (("items"."category" = 'TOOL') = ("items"."tool_category" is not null)
        and ("items"."category" = 'TOOL' or ("items"."tool_ability" is null and "items"."tool_uses" is null))),
	CONSTRAINT "items_container_check" CHECK (("items"."category" = 'CONTAINER' or ("items"."capacity_value" is null and "items"."capacity_weight" is null))
        and ("items"."capacity_value" is null) = ("items"."capacity_unit" is null)
        and ("items"."capacity_value" is null or "items"."capacity_value" > 0)
        and ("items"."capacity_weight" is null or "items"."capacity_weight" > 0)),
	CONSTRAINT "items_magic_check" CHECK ("items"."is_magical" = ("items"."rarity" is not null)
        and "items"."is_magical" = ("items"."magic_item_type" is not null)
        and ("items"."category" <> 'MAGIC_ITEM' or "items"."is_magical")
        and ("items"."is_magical" or ("items"."magic_bonus" = 0 and "items"."attunement_mode" = 'NONE'
          and "items"."charges_maximum" is null and "items"."sentience" is null))
        and ("items"."magic_bonus" = 0 or "items"."category" in ('WEAPON', 'ARMOR', 'SHIELD'))
        and "items"."magic_bonus" between -5 and 10
        and ("items"."attunement_prerequisite" is null or "items"."attunement_mode" <> 'NONE')
        and ("items"."charges_maximum" is null or "items"."charges_maximum" between 1 and 1000)
        and ("items"."recharge" is null or "items"."charges_maximum" is not null)),
	CONSTRAINT "items_definition_types_check" CHECK (jsonb_typeof("items"."weapon_properties") = 'array'
        and jsonb_typeof("items"."effects") = 'array'
        and jsonb_typeof("items"."feature_grants") = 'array'
        and jsonb_typeof("items"."spells") = 'array'
        and ("items"."recharge" is null or jsonb_typeof("items"."recharge") = 'object')
        and ("items"."sentience" is null or jsonb_typeof("items"."sentience") = 'object'))
);
--> statement-breakpoint
ALTER TABLE "item_instance_knowledge" ADD CONSTRAINT "item_instance_knowledge_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance_knowledge" ADD CONSTRAINT "item_instance_knowledge_instance_id_item_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."item_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance_knowledge" ADD CONSTRAINT "item_instance_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_item_asset_id_assets_id_fk" FOREIGN KEY ("item_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_campaign_fk" FOREIGN KEY ("owner_asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_forked_from_asset_id_assets_id_fk" FOREIGN KEY ("forked_from_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_asset_campaign_fk" FOREIGN KEY ("asset_id","campaign_id") REFERENCES "public"."assets"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_instance_knowledge_user_active_unique_idx" ON "item_instance_knowledge" USING btree ("instance_id","user_id") WHERE "item_instance_knowledge"."deleted_at" is null and "item_instance_knowledge"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "item_instance_knowledge_all_active_unique_idx" ON "item_instance_knowledge" USING btree ("instance_id") WHERE "item_instance_knowledge"."deleted_at" is null and "item_instance_knowledge"."user_id" is null;--> statement-breakpoint
CREATE INDEX "item_instance_knowledge_user_idx" ON "item_instance_knowledge" USING btree ("campaign_id","user_id") WHERE "item_instance_knowledge"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "item_instances_campaign_idx" ON "item_instances" USING btree ("campaign_id","created_at") WHERE "item_instances"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "item_instances_item_idx" ON "item_instances" USING btree ("item_asset_id") WHERE "item_instances"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "item_instances_owner_idx" ON "item_instances" USING btree ("owner_asset_id") WHERE "item_instances"."deleted_at" is null and "item_instances"."owner_asset_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "items_asset_active_unique_idx" ON "items" USING btree ("asset_id") WHERE "items"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "items_campaign_code_active_unique_idx" ON "items" USING btree ("campaign_id","code") WHERE "items"."deleted_at" is null and "items"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "items_campaign_idx" ON "items" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "items_system_code_idx" ON "items" USING btree ("code") WHERE "items"."deleted_at" is null and "items"."campaign_id" is null;