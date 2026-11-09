import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { users } from "../../../users/domain/entities/UsersTable.js";

export const ITEM_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "SHIELD",
  "TOOL",
  "ADVENTURING_GEAR",
  "CONTAINER",
  "CONSUMABLE",
  "MOUNT",
  "VEHICLE",
  "TREASURE",
  "MAGIC_ITEM",
  "CUSTOM",
] as const;

export const ITEM_CURRENCIES = ["CP", "SP", "EP", "GP", "PP"] as const;
export const WEAPON_CATEGORIES = ["SIMPLE", "MARTIAL"] as const;
export const WEAPON_COMBAT_TYPES = ["MELEE", "RANGED"] as const;
export const DAMAGE_TYPES = [
  "ACID",
  "BLUDGEONING",
  "COLD",
  "FIRE",
  "FORCE",
  "LIGHTNING",
  "NECROTIC",
  "PIERCING",
  "POISON",
  "PSYCHIC",
  "RADIANT",
  "SLASHING",
  "THUNDER",
] as const;
export const WEAPON_PROPERTIES = [
  "AMMUNITION",
  "FINESSE",
  "HEAVY",
  "LIGHT",
  "LOADING",
  "REACH",
  "SPECIAL",
  "THROWN",
  "TWO_HANDED",
  "VERSATILE",
] as const;
/** Weapon masteries of the 2024 rules; the character modules decide whether a ruleset uses them. */
export const WEAPON_MASTERIES = ["CLEAVE", "GRAZE", "NICK", "PUSH", "SAP", "SLOW", "TOPPLE", "VEX"] as const;
export const ARMOR_CATEGORIES = ["LIGHT", "MEDIUM", "HEAVY", "SHIELD"] as const;
/** How much of the Dexterity modifier armor adds to the armor class. */
export const DEXTERITY_MODES = ["FULL", "CAPPED", "NONE"] as const;
export const TOOL_CATEGORIES = ["ARTISANS_TOOLS", "GAMING_SET", "MUSICAL_INSTRUMENT", "OTHER"] as const;
export const ITEM_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const CAPACITY_UNITS = ["CUBIC_FEET", "GALLONS", "PINTS", "PIECES"] as const;
export const MAGIC_ITEM_TYPES = [
  "ARMOR",
  "POTION",
  "RING",
  "ROD",
  "SCROLL",
  "STAFF",
  "WAND",
  "WEAPON",
  "WONDROUS_ITEM",
] as const;
export const ITEM_RARITIES = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "VERY_RARE",
  "LEGENDARY",
  "ARTIFACT",
  "VARIES",
] as const;
export const ATTUNEMENT_MODES = ["NONE", "OPTIONAL", "REQUIRED"] as const;

export const ITEM_OWNER_TYPES = ["UNASSIGNED", "ACTOR", "LOCATION", "QUEST", "OTHER"] as const;
export const ITEM_CONDITIONS = ["PRISTINE", "WORN", "DAMAGED", "BROKEN", "DESTROYED"] as const;
export const ITEM_KNOWLEDGE_LEVELS = ["UNKNOWN", "SEEN", "IDENTIFIED"] as const;

/** Upper bounds; the DTOs use the same values. */
export const ITEM_TEXT_MAX_LENGTH = 50_000;
export const ITEM_NAME_MAX_LENGTH = 200;
export const ITEM_MAX_QUANTITY = 1_000_000;
export const ITEM_MAX_CHARGES = 1_000;
export const ITEM_MAX_MAGIC_BONUS = 10;
export const ITEM_MIN_MAGIC_BONUS = -5;

export const itemCategoryEnum = pgEnum("item_category", ITEM_CATEGORIES);
export const itemCurrencyEnum = pgEnum("item_currency", ITEM_CURRENCIES);
export const itemWeaponCategoryEnum = pgEnum("item_weapon_category", WEAPON_CATEGORIES);
export const itemWeaponCombatTypeEnum = pgEnum("item_weapon_combat_type", WEAPON_COMBAT_TYPES);
export const itemDamageTypeEnum = pgEnum("item_damage_type", DAMAGE_TYPES);
export const itemWeaponMasteryEnum = pgEnum("item_weapon_mastery", WEAPON_MASTERIES);
export const itemArmorCategoryEnum = pgEnum("item_armor_category", ARMOR_CATEGORIES);
export const itemDexterityModeEnum = pgEnum("item_dexterity_mode", DEXTERITY_MODES);
export const itemToolCategoryEnum = pgEnum("item_tool_category", TOOL_CATEGORIES);
export const itemAbilityEnum = pgEnum("item_ability", ITEM_ABILITIES);
export const itemCapacityUnitEnum = pgEnum("item_capacity_unit", CAPACITY_UNITS);
export const itemMagicTypeEnum = pgEnum("item_magic_type", MAGIC_ITEM_TYPES);
export const itemRarityEnum = pgEnum("item_rarity", ITEM_RARITIES);
export const itemAttunementModeEnum = pgEnum("item_attunement_mode", ATTUNEMENT_MODES);
export const itemOwnerTypeEnum = pgEnum("item_owner_type", ITEM_OWNER_TYPES);
export const itemConditionEnum = pgEnum("item_condition", ITEM_CONDITIONS);
export const itemKnowledgeLevelEnum = pgEnum("item_knowledge_level", ITEM_KNOWLEDGE_LEVELS);

/** Parts of the definition stored as one jsonb value each and validated by the DTOs. */
export const ITEM_DEFINITION_PARTS = ["weaponProperties", "effects", "featureGrants", "spells"] as const;

const max = (value: number) => sql.raw(String(value));

/**
 * Definition of an item. Name, summary, status, rulesets and source belong to the asset of type
 * `ITEM`. Global items have no campaign and are changed by administrators only; custom items
 * belong to one campaign, which the composite foreign key keeps in line with the asset.
 *
 * The details of a category are typed columns of this row, not separate tables, so the history
 * keeps one entry per item and a change of category can be undone as a whole; the check
 * constraints allow the columns of a category only on items of that category. The values the
 * character modules calculate with (damage, armor class, magic bonus, charges) are columns; effects
 * (`#core/rules` payloads such as `MODIFIER ability.str`), feature grants and the spells an item
 * casts are jsonb parts. Quantity, condition, equipment and charges left belong to instances.
 */
export const items = pgTable(
  "items",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    category: itemCategoryEnum("category").notNull(),
    description: text("description"),
    /** Only for those who may change the item; never in the player view. */
    gmNotes: text("gm_notes"),
    costAmount: integer("cost_amount"),
    costCurrency: itemCurrencyEnum("cost_currency"),
    /** Pounds. */
    weight: numeric("weight", { precision: 10, scale: 2, mode: "number" }),
    isMagical: boolean("is_magical").notNull().default(false),
    /** Instances may hold more than one piece (arrows, coins, rations). */
    isStackable: boolean("is_stackable").notNull().default(false),
    /** Used up when used (potions, scrolls, ammunition after the fight). */
    consumedOnUse: boolean("consumed_on_use").notNull().default(false),

    // Weapons
    weaponCategory: itemWeaponCategoryEnum("weapon_category"),
    weaponCombatType: itemWeaponCombatTypeEnum("weapon_combat_type"),
    damageDiceCount: integer("damage_dice_count"),
    damageDiceFaces: integer("damage_dice_faces"),
    /** Fixed damage instead of dice (a blowgun deals 1). */
    damageFixed: integer("damage_fixed"),
    damageType: itemDamageTypeEnum("damage_type"),
    /** Die used with two hands; only with the property `VERSATILE`. */
    versatileDiceFaces: integer("versatile_dice_faces"),
    weaponProperties: jsonb("weapon_properties").notNull().default(sql`'[]'::jsonb`),
    /** Feet; ranged and thrown weapons. */
    rangeNormal: integer("range_normal"),
    rangeLong: integer("range_long"),
    masteryProperty: itemWeaponMasteryEnum("mastery_property"),

    // Armor and shields
    armorCategory: itemArmorCategoryEnum("armor_category"),
    /** Armor: the base armor class; shields: the bonus they add. */
    baseArmorClass: integer("base_armor_class"),
    dexterityMode: itemDexterityModeEnum("dexterity_mode"),
    dexterityCap: integer("dexterity_cap"),
    strengthRequirement: integer("strength_requirement"),
    stealthDisadvantage: boolean("stealth_disadvantage").notNull().default(false),

    // Tools
    toolCategory: itemToolCategoryEnum("tool_category"),
    toolAbility: itemAbilityEnum("tool_ability"),
    toolUses: text("tool_uses"),

    // Containers
    capacityValue: numeric("capacity_value", { precision: 10, scale: 2, mode: "number" }),
    capacityUnit: itemCapacityUnitEnum("capacity_unit"),
    /** Pounds the container holds. */
    capacityWeight: numeric("capacity_weight", { precision: 10, scale: 2, mode: "number" }),

    // Magic
    /** +1 weapon: attack and damage; +1 armor or shield: armor class. */
    magicBonus: integer("magic_bonus").notNull().default(0),
    magicItemType: itemMagicTypeEnum("magic_item_type"),
    rarity: itemRarityEnum("rarity"),
    attunementMode: itemAttunementModeEnum("attunement_mode").notNull().default("NONE"),
    attunementPrerequisite: text("attunement_prerequisite"),
    chargesMaximum: integer("charges_maximum"),
    recharge: jsonb("recharge"),
    sentience: jsonb("sentience"),

    // Parts
    effects: jsonb("effects").notNull().default(sql`'[]'::jsonb`),
    featureGrants: jsonb("feature_grants").notNull().default(sql`'[]'::jsonb`),
    spells: jsonb("spells").notNull().default(sql`'[]'::jsonb`),

    /** The item this one was forked from; no reference, so the source can still be archived. */
    forkedFromAssetId: uuid("forked_from_asset_id").references(() => assets.id, { onDelete: "restrict" }),
  },
  (table) => [
    foreignKey({
      name: "items_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global items rely on the first one.
    foreignKey({
      name: "items_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("items_asset_active_unique_idx", [table.assetId], table.deletedAt),
    uniqueIndex("items_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("items_campaign_idx").on(table.campaignId),
    index("items_category_idx").on(table.category),
    index("items_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("items_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "items_text_length_check",
      sql`(${table.description} is null or char_length(${table.description}) between 1 and ${max(ITEM_TEXT_MAX_LENGTH)})
        and (${table.gmNotes} is null or char_length(${table.gmNotes}) between 1 and ${max(ITEM_TEXT_MAX_LENGTH)})
        and (${table.toolUses} is null or char_length(${table.toolUses}) between 1 and ${max(ITEM_TEXT_MAX_LENGTH)})
        and (${table.attunementPrerequisite} is null or char_length(${table.attunementPrerequisite}) between 1 and 500)`,
    ),
    check(
      "items_cost_check",
      sql`(${table.costAmount} is null) = (${table.costCurrency} is null)
        and (${table.costAmount} is null or ${table.costAmount} between 0 and 100000000)
        and (${table.weight} is null or ${table.weight} between 0 and 100000)`,
    ),
    check(
      "items_weapon_check",
      sql`case when ${table.category} = 'WEAPON' then
          ${table.weaponCategory} is not null and ${table.weaponCombatType} is not null
        else
          ${table.weaponCategory} is null and ${table.weaponCombatType} is null
          and ${table.damageDiceCount} is null and ${table.damageFixed} is null and ${table.damageType} is null
          and ${table.versatileDiceFaces} is null and ${table.rangeNormal} is null
          and ${table.masteryProperty} is null and ${table.weaponProperties} = '[]'::jsonb
        end
        and (${table.damageDiceCount} is null) = (${table.damageDiceFaces} is null)
        and (${table.damageDiceCount} is null or ${table.damageFixed} is null)
        and (${table.damageType} is not null) = (${table.damageDiceCount} is not null or ${table.damageFixed} is not null)
        and (${table.damageDiceCount} is null or ${table.damageDiceCount} between 1 and 20)
        and (${table.damageDiceFaces} is null or ${table.damageDiceFaces} in (2, 3, 4, 6, 8, 10, 12, 20, 100))
        and (${table.versatileDiceFaces} is null or ${table.versatileDiceFaces} in (2, 3, 4, 6, 8, 10, 12, 20, 100))
        and (${table.damageFixed} is null or ${table.damageFixed} between 1 and 100)
        and (${table.rangeNormal} is null) = (${table.rangeLong} is null)
        and (${table.rangeNormal} is null or (${table.rangeNormal} between 1 and 10000 and ${table.rangeLong} between ${table.rangeNormal} and 10000))`,
    ),
    check(
      "items_armor_check",
      sql`case when ${table.category} in ('ARMOR', 'SHIELD') then
          ${table.armorCategory} is not null and ${table.baseArmorClass} is not null and ${table.dexterityMode} is not null
          and (${table.category} = 'SHIELD') = (${table.armorCategory} = 'SHIELD')
        else
          ${table.armorCategory} is null and ${table.baseArmorClass} is null and ${table.dexterityMode} is null
          and ${table.strengthRequirement} is null and not ${table.stealthDisadvantage}
        end
        and (${table.dexterityCap} is not null) = (${table.dexterityMode} is not distinct from 'CAPPED')
        and (${table.baseArmorClass} is null or ${table.baseArmorClass} between 0 and 30)
        and (${table.dexterityCap} is null or ${table.dexterityCap} between 0 and 10)
        and (${table.strengthRequirement} is null or ${table.strengthRequirement} between 1 and 30)`,
    ),
    check(
      "items_tool_check",
      sql`(${table.category} = 'TOOL') = (${table.toolCategory} is not null)
        and (${table.category} = 'TOOL' or (${table.toolAbility} is null and ${table.toolUses} is null))`,
    ),
    check(
      "items_container_check",
      sql`(${table.category} = 'CONTAINER' or (${table.capacityValue} is null and ${table.capacityWeight} is null))
        and (${table.capacityValue} is null) = (${table.capacityUnit} is null)
        and (${table.capacityValue} is null or ${table.capacityValue} > 0)
        and (${table.capacityWeight} is null or ${table.capacityWeight} > 0)`,
    ),
    check(
      "items_magic_check",
      sql`${table.isMagical} = (${table.rarity} is not null)
        and ${table.isMagical} = (${table.magicItemType} is not null)
        and (${table.category} <> 'MAGIC_ITEM' or ${table.isMagical})
        and (${table.isMagical} or (${table.magicBonus} = 0 and ${table.attunementMode} = 'NONE'
          and ${table.chargesMaximum} is null and ${table.sentience} is null))
        and (${table.magicBonus} = 0 or ${table.category} in ('WEAPON', 'ARMOR', 'SHIELD'))
        and ${table.magicBonus} between ${max(ITEM_MIN_MAGIC_BONUS)} and ${max(ITEM_MAX_MAGIC_BONUS)}
        and (${table.attunementPrerequisite} is null or ${table.attunementMode} <> 'NONE')
        and (${table.chargesMaximum} is null or ${table.chargesMaximum} between 1 and ${max(ITEM_MAX_CHARGES)})
        and (${table.recharge} is null or ${table.chargesMaximum} is not null)`,
    ),
    check(
      "items_definition_types_check",
      sql`jsonb_typeof(${table.weaponProperties}) = 'array'
        and jsonb_typeof(${table.effects}) = 'array'
        and jsonb_typeof(${table.featureGrants}) = 'array'
        and jsonb_typeof(${table.spells}) = 'array'
        and (${table.recharge} is null or jsonb_typeof(${table.recharge}) = 'object')
        and (${table.sentience} is null or jsonb_typeof(${table.sentience}) = 'object')`,
    ),
  ],
);

/**
 * One concrete item in a campaign: a definition (global or custom), how many pieces, who has it and
 * its state. The definition is read in its current version; nothing of it is copied, and a change
 * of the definition leaves the stored state (charges, condition) as it is.
 *
 * Owners are campaign assets (characters, NPCs, monsters, locations, quests); the composite key
 * keeps them in the campaign of the instance. Only instances an actor has can be equipped or
 * attuned.
 */
export const itemInstances = pgTable(
  "item_instances",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    itemAssetId: uuid("item_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    customName: varchar("custom_name", { length: ITEM_NAME_MAX_LENGTH }),
    quantity: integer("quantity").notNull().default(1),
    ownerType: itemOwnerTypeEnum("owner_type").notNull().default("UNASSIGNED"),
    ownerAssetId: uuid("owner_asset_id"),
    condition: itemConditionEnum("condition").notNull().default("PRISTINE"),
    currentCharges: integer("current_charges"),
    equipped: boolean("equipped").notNull().default(false),
    attuned: boolean("attuned").notNull().default(false),
    /** Only for those who may change the instance. */
    notes: text("notes"),
  },
  (table) => [
    foreignKey({
      name: "item_instances_owner_campaign_fk",
      columns: [table.ownerAssetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    index("item_instances_campaign_idx")
      .on(table.campaignId, table.createdAt)
      .where(sql`${table.deletedAt} is null`),
    index("item_instances_item_idx")
      .on(table.itemAssetId)
      .where(sql`${table.deletedAt} is null`),
    index("item_instances_owner_idx")
      .on(table.ownerAssetId)
      .where(sql`${table.deletedAt} is null and ${table.ownerAssetId} is not null`),
    check(
      "item_instances_quantity_check",
      sql`${table.quantity} between 1 and ${max(ITEM_MAX_QUANTITY)}`,
    ),
    check(
      "item_instances_owner_check",
      sql`(${table.ownerType} = 'UNASSIGNED') = (${table.ownerAssetId} is null)
        and (${table.ownerType} = 'ACTOR' or (not ${table.equipped} and not ${table.attuned}))`,
    ),
    check(
      "item_instances_charges_check",
      sql`${table.currentCharges} is null or ${table.currentCharges} between 0 and ${max(ITEM_MAX_CHARGES)}`,
    ),
    check(
      "item_instances_text_check",
      sql`(${table.customName} is null or char_length(${table.customName}) >= 1)
        and (${table.notes} is null or char_length(${table.notes}) between 1 and ${max(ITEM_TEXT_MAX_LENGTH)})`,
    ),
  ],
);

/**
 * What players know about an instance. A row without `userId` holds for every player of the
 * campaign; a row of one player overrides it for that player. `SEEN` shows the item as it looks
 * (no magic, no definition name of magic items), `IDENTIFIED` the item as the player view of its
 * definition, also when the definition is not released. `knownName` and `knownDescription` are
 * what the players call it.
 */
export const itemInstanceKnowledge = pgTable(
  "item_instance_knowledge",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => itemInstances.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    knowledgeLevel: itemKnowledgeLevelEnum("knowledge_level").notNull(),
    knownName: varchar("known_name", { length: ITEM_NAME_MAX_LENGTH }),
    knownDescription: text("known_description"),
  },
  (table) => [
    uniqueIndex("item_instance_knowledge_user_active_unique_idx")
      .on(table.instanceId, table.userId)
      .where(sql`${table.deletedAt} is null and ${table.userId} is not null`),
    uniqueIndex("item_instance_knowledge_all_active_unique_idx")
      .on(table.instanceId)
      .where(sql`${table.deletedAt} is null and ${table.userId} is null`),
    index("item_instance_knowledge_user_idx")
      .on(table.campaignId, table.userId)
      .where(sql`${table.deletedAt} is null`),
    check(
      "item_instance_knowledge_text_check",
      sql`(${table.knownName} is null or char_length(${table.knownName}) >= 1)
        and (${table.knownDescription} is null or char_length(${table.knownDescription}) between 1 and ${max(ITEM_TEXT_MAX_LENGTH)})`,
    ),
  ],
);
