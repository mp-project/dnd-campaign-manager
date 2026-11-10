import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { ABILITIES, featureKeyDto } from "#src/modules/features/index";
import { itemCurrencyEnum, itemDamageTypeEnum } from "#src/modules/items/index";
import { MOVEMENT_MODES } from "#src/modules/species/index";

/**
 * Schemas of the parts of an actor. Each part is stored as one jsonb value and holds base values
 * only: what a stat block computes (modifiers, bonuses, armor class, passive perception …) is never
 * stored. Values that replace a computed one are overrides and need a reason. Rules within a part
 * (unique keys, fields that belong together) are checked here, references to other assets and item
 * instances by the service.
 */

export type Ability = (typeof ABILITIES)[number];

/** The skills of the rules with the ability they use; codes as backgrounds name them. */
export const SKILLS = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Ability>;

export const SKILL_CODES = Object.keys(SKILLS) as [keyof typeof SKILLS, ...(keyof typeof SKILLS)[]];
export type SkillCode = keyof typeof SKILLS;

export const SKILL_PROFICIENCY_LEVELS = ["NONE", "HALF", "PROFICIENT", "EXPERTISE"] as const;
export const PROFICIENCY_TYPES = ["ARMOR", "WEAPON", "TOOL", "VEHICLE", "OTHER"] as const;
export const SENSE_TYPES = ["DARKVISION", "BLINDSIGHT", "TREMORSENSE", "TRUESIGHT"] as const;
export const DEFENSE_TYPES = ["RESISTANCE", "IMMUNITY", "VULNERABILITY", "CONDITION_IMMUNITY"] as const;
export const CONDITIONS = [
  "BLINDED",
  "CHARMED",
  "DEAFENED",
  "EXHAUSTION",
  "FRIGHTENED",
  "GRAPPLED",
  "INCAPACITATED",
  "INVISIBLE",
  "PARALYZED",
  "PETRIFIED",
  "POISONED",
  "PRONE",
  "RESTRAINED",
  "STUNNED",
  "UNCONSCIOUS",
] as const;
export const DAMAGE_TYPES = itemDamageTypeEnum.enumValues;
export const CURRENCIES = itemCurrencyEnum.enumValues;
export const TRAIT_KINDS = [
  "TRAIT",
  "ACTION",
  "BONUS_ACTION",
  "REACTION",
  "LEGENDARY",
  "LAIR",
  "MYTHIC",
] as const;
export const ATTACK_TYPES = ["MELEE_WEAPON", "RANGED_WEAPON", "MELEE_SPELL", "RANGED_SPELL"] as const;
export const LOOT_KINDS = ["CARRIED_ITEM", "ITEM", "CURRENCY", "TEXT"] as const;
export { MOVEMENT_MODES };

/** Maximum entries per list part. */
export const ACTOR_PART_MAX_ITEMS = 50;
export const ACTOR_TRAIT_TEXT_MAX_LENGTH = 10_000;
export const ACTOR_LONG_TEXT_MAX_LENGTH = 20_000;

const displayOrderDto = z.number().int().min(0).max(1_000).default(0);
const labelDto = z.string().trim().min(1).max(160);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const reasonDto = optionalText(500);
/** A code such as `light-armor`, `thieves-tools` or `elvish`. */
const codeValueDto = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Codes use a-z, 0-9 and single hyphens" });
const bonusDto = z.number().int().min(-20).max(50);
const feetDto = z.number().int().min(0).max(10_000);
/** Dice as written in a stat block: `7d8`, `7d8 + 14`, `2d6 - 1`. */
export const HIT_DICE_FORMULA = /^(\d{1,3})d(4|6|8|10|12|20)(?:\s*([+-])\s*(\d{1,4}))?$/;
/** A fixed amount or a roll: `3`, `2d4`, `3d6 + 10`; for loot. */
export const QUANTITY_EXPRESSION = /^(?:\d{1,6}|\d{1,3}d(?:2|3|4|6|8|10|12|20|100)(?:\s*[+-]\s*\d{1,6})?(?:\s*[x×*]\s*\d{1,6})?)$/;

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

/** A list of at most `ACTOR_PART_MAX_ITEMS` entries whose `keyOf` must be unique. */
function uniqueList<T extends z.ZodType>(item: T, keyOf: (entry: z.infer<T>) => string, message: string) {
  return z
    .array(item)
    .max(ACTOR_PART_MAX_ITEMS)
    .refine((entries) => uniqueBy(entries, keyOf), { message });
}

/** Override fields need a reason, so a replaced value is never a mystery later. */
function requireReason(
  value: { overrideReason: string | null },
  overrides: readonly unknown[],
  ctx: z.RefinementCtx,
): void {
  if (overrides.some((override) => override !== null) && value.overrideReason === null) {
    ctx.addIssue({ code: "custom", path: ["overrideReason"], message: "An override needs a reason" });
  }
}

// ---------------------------------------------------------------------------
// Abilities and skills
// ---------------------------------------------------------------------------

/**
 * One ability: the base score (rolled, point buy or the stat block of a monster); bonuses from
 * species, feats and items are added when the stat block is computed. `scoreOverride` replaces the
 * computed score, `savingThrowBonusOverride` the computed saving throw.
 */
export const AbilityEntrySchema = z
  .strictObject({
    score: z.number().int().min(1).max(30),
    savingThrowProficient: z.boolean().default(false),
    scoreOverride: z.number().int().min(1).max(30).nullable().default(null),
    savingThrowBonusOverride: bonusDto.nullable().default(null),
    overrideReason: reasonDto,
  })
  .superRefine((entry, ctx) =>
    requireReason(entry, [entry.scoreOverride, entry.savingThrowBonusOverride], ctx),
  );

/** All six abilities, always. */
export const AbilitiesSchema = z.strictObject(
  Object.fromEntries(ABILITIES.map((ability) => [ability, AbilityEntrySchema])) as Record<
    Ability,
    typeof AbilityEntrySchema
  >,
);

/** Abilities of a new actor that sends none: 10 everywhere, like an average commoner. */
export const DEFAULT_ABILITIES = Object.fromEntries(
  ABILITIES.map((ability) => [ability, AbilityEntrySchema.parse({ score: 10 })]),
) as z.infer<typeof AbilitiesSchema>;

/**
 * A skill the actor is trained in (or wants to note). `ability` uses another ability than the rules
 * do, `bonusOverride` replaces the computed bonus.
 */
export const SkillEntrySchema = z
  .strictObject({
    skill: z.enum(SKILL_CODES),
    proficiency: z.enum(SKILL_PROFICIENCY_LEVELS).default("PROFICIENT"),
    ability: z.enum(ABILITIES).nullable().default(null),
    bonusOverride: bonusDto.nullable().default(null),
    overrideReason: reasonDto,
  })
  .superRefine((entry, ctx) => requireReason(entry, [entry.ability, entry.bonusOverride], ctx));

// ---------------------------------------------------------------------------
// Proficiencies, languages, senses, speeds, defenses
// ---------------------------------------------------------------------------

/**
 * Armor, weapon, tool or other proficiency, as a code (`light-armor`, `martial-weapons`,
 * `thieves-tools`) or one item (`itemAssetId`, a global item or one of the campaign). Items check
 * proficiency by these codes and ids.
 */
export const ProficiencyEntrySchema = z
  .strictObject({
    type: z.enum(PROFICIENCY_TYPES),
    code: codeValueDto.nullable().default(null),
    itemAssetId: uuidDto.nullable().default(null),
    label: labelDto.nullable().default(null),
  })
  .refine((entry) => (entry.code === null) !== (entry.itemAssetId === null), {
    message: "A proficiency names either a code or an item",
    path: ["code"],
  });

export const LanguageEntrySchema = z.strictObject({
  code: codeValueDto,
  /** Shown instead of the code, e.g. `Deep Speech`. */
  label: labelDto.nullable().default(null),
  canSpeak: z.boolean().default(true),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(true),
  notes: optionalText(500),
});

export const SenseEntrySchema = z.strictObject({
  type: z.enum(SENSE_TYPES),
  rangeFeet: feetDto,
  notes: optionalText(500),
});

export const SpeedEntrySchema = z
  .strictObject({
    mode: z.enum(MOVEMENT_MODES),
    distanceFeet: z.number().int().min(0).max(1_000),
    hover: z.boolean().default(false),
    notes: optionalText(500),
  })
  .refine((entry) => !entry.hover || entry.mode === "FLY", {
    message: "Only a flying speed can hover",
    path: ["hover"],
  });

/** Damage types for resistances, immunities and vulnerabilities, conditions for condition immunities. */
export const DefenseEntrySchema = z
  .strictObject({
    type: z.enum(DEFENSE_TYPES),
    target: z.string().trim().min(1).max(40),
    /** E.g. "from nonmagical attacks". */
    notes: optionalText(500),
  })
  .superRefine((entry, ctx) => {
    const allowed: readonly string[] = entry.type === "CONDITION_IMMUNITY" ? CONDITIONS : DAMAGE_TYPES;

    if (!allowed.includes(entry.target)) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: `Expected one of ${allowed.join(", ")}`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Combat values
// ---------------------------------------------------------------------------

/**
 * Values a stat block takes as they are instead of computing them, e.g. from a printed monster
 * stat block: armor class (otherwise worn armor or 10 + Dexterity), hit points (otherwise the
 * average of the formula; later the class levels), initiative bonus (otherwise Dexterity) and the
 * proficiency bonus (later the character level).
 */
export const CombatSchema = z
  .strictObject({
    armorClass: z.number().int().min(0).max(50).nullable().default(null),
    /** E.g. "natural armor" or "chain mail, shield". */
    armorClassNote: optionalText(160),
    hitPointMaximum: z.number().int().min(1).max(10_000).nullable().default(null),
    hitPointFormula: z.string().trim().regex(HIT_DICE_FORMULA, { message: "Use a formula like 7d8 + 14" }).nullable().default(null),
    initiativeBonus: bonusDto.nullable().default(null),
    proficiencyBonus: z.number().int().min(0).max(20).nullable().default(null),
  });

// ---------------------------------------------------------------------------
// Traits and actions
// ---------------------------------------------------------------------------

export const AttackDamageSchema = z
  .strictObject({
    diceCount: z.number().int().min(1).max(100).nullable().default(null),
    diceFaces: z.literal([4, 6, 8, 10, 12, 20]).nullable().default(null),
    bonus: z.number().int().min(-20).max(500).default(0),
    damageType: z.enum(DAMAGE_TYPES),
  })
  .refine((damage) => (damage.diceCount === null) === (damage.diceFaces === null), {
    message: "Dice need a count and faces",
    path: ["diceFaces"],
  });

export const AttackSchema = z
  .strictObject({
    type: z.enum(ATTACK_TYPES),
    attackBonus: bonusDto,
    reachFeet: feetDto.nullable().default(null),
    rangeNormalFeet: feetDto.nullable().default(null),
    rangeLongFeet: feetDto.nullable().default(null),
    damage: z.array(AttackDamageSchema).min(1).max(5),
  })
  .superRefine((attack, ctx) => {
    const melee = attack.type.startsWith("MELEE");

    if (melee && attack.reachFeet === null) {
      ctx.addIssue({ code: "custom", path: ["reachFeet"], message: "A melee attack needs a reach" });
    }

    if (!melee && attack.rangeNormalFeet === null) {
      ctx.addIssue({ code: "custom", path: ["rangeNormalFeet"], message: "A ranged attack needs a range" });
    }

    if (
      attack.rangeLongFeet !== null &&
      (attack.rangeNormalFeet === null || attack.rangeLongFeet < attack.rangeNormalFeet)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rangeLongFeet"],
        message: "The long range is not below the normal range",
      });
    }
  });

/**
 * A trait or an action written into the stat block, like a monster's "Pack Tactics" or "Multiattack".
 * Features from classes, species, feats and items come from their sources, not from here.
 */
export const TraitEntrySchema = z
  .strictObject({
    key: featureKeyDto,
    kind: z.enum(TRAIT_KINDS),
    name: labelDto,
    /** Markdown, rendered on reading. */
    description: z.string().trim().min(1).max(ACTOR_TRAIT_TEXT_MAX_LENGTH),
    attack: AttackSchema.nullable().default(null),
    /** E.g. `5-6` for "Recharge 5–6". */
    recharge: z.string().trim().regex(/^[1-6](?:-[1-6])?$/).nullable().default(null),
    usesPerDay: z.number().int().min(1).max(20).nullable().default(null),
    /** What a legendary action costs. */
    legendaryCost: z.number().int().min(1).max(5).nullable().default(null),
    displayOrder: displayOrderDto,
  })
  .superRefine((entry, ctx) => {
    if (entry.legendaryCost !== null && entry.kind !== "LEGENDARY") {
      ctx.addIssue({ code: "custom", path: ["legendaryCost"], message: "Only legendary actions have a cost" });
    }

    if (entry.attack !== null && entry.kind === "TRAIT") {
      ctx.addIssue({ code: "custom", path: ["attack"], message: "Traits make no attacks; use an action" });
    }
  });

// ---------------------------------------------------------------------------
// Appearance and personality
// ---------------------------------------------------------------------------

export const AppearanceSchema = z.strictObject({
  age: optionalText(100),
  height: optionalText(100),
  weight: optionalText(100),
  eyes: optionalText(100),
  skin: optionalText(100),
  hair: optionalText(100),
  genderOrIdentity: optionalText(100),
  faith: optionalText(160),
  /** Free text, e.g. clothing and marks. */
  description: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
});

export const PersonalitySchema = z.strictObject({
  traits: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
  ideals: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
  bonds: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
  flaws: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
  backstory: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
  alliesAndOrganizations: optionalText(ACTOR_LONG_TEXT_MAX_LENGTH),
});

// ---------------------------------------------------------------------------
// Wallet and loot
// ---------------------------------------------------------------------------

const coinsDto = z.number().int().min(0).max(1_000_000_000).default(0);

export const WalletSchema = z.strictObject({
  cp: coinsDto,
  sp: coinsDto,
  ep: coinsDto,
  gp: coinsDto,
  pp: coinsDto,
  /** Currencies of the world, such as trade bars or gems counted as money. */
  custom: uniqueList(
    z.strictObject({ name: labelDto, amount: coinsDto }),
    (entry) => entry.name.toLowerCase(),
    "Custom currencies must be unique",
  ).default([]),
});

const lootBase = {
  key: featureKeyDto,
  /** When it drops, e.g. "only if the chest is searched". */
  condition: optionalText(500),
  notes: optionalText(2_000),
  displayOrder: displayOrderDto,
};
const quantityExpressionDto = z
  .string()
  .trim()
  .regex(QUANTITY_EXPRESSION, { message: "Use a number or dice such as 2d4 + 1" });

/**
 * What the party gets from the actor, which is not everything it has: `CARRIED_ITEM` marks an item
 * instance the actor owns (all of the stack, or `quantity` pieces), `ITEM` plans an item that doesn't
 * exist yet, `CURRENCY` coins, `TEXT` anything else. Nothing is handed out here.
 */
export const CarriedItemLootSchema = z.strictObject({
  ...lootBase,
  kind: z.literal("CARRIED_ITEM"),
  itemInstanceId: uuidDto,
  quantity: z.number().int().min(1).max(1_000_000).nullable().default(null),
});

export const PlannedItemLootSchema = z.strictObject({
  ...lootBase,
  kind: z.literal("ITEM"),
  itemAssetId: uuidDto,
  quantity: quantityExpressionDto.default("1"),
});

export const CurrencyLootSchema = z.strictObject({
  ...lootBase,
  kind: z.literal("CURRENCY"),
  currency: z.enum(CURRENCIES),
  amount: quantityExpressionDto,
});

export const TextLootSchema = z.strictObject({
  ...lootBase,
  kind: z.literal("TEXT"),
  text: z.string().trim().min(1).max(2_000),
});

export const LootEntrySchema = z.discriminatedUnion("kind", [
  CarriedItemLootSchema,
  PlannedItemLootSchema,
  CurrencyLootSchema,
  TextLootSchema,
]);

// ---------------------------------------------------------------------------
// All parts
// ---------------------------------------------------------------------------

export const ActorPartsSchema = z.strictObject({
  abilities: AbilitiesSchema,
  skills: uniqueList(SkillEntrySchema, (entry) => entry.skill, "Each skill once"),
  proficiencies: uniqueList(
    ProficiencyEntrySchema,
    (entry) => `${entry.type}:${entry.code ?? entry.itemAssetId}`,
    "Each proficiency once",
  ),
  languages: uniqueList(LanguageEntrySchema, (entry) => entry.code, "Each language once"),
  senses: uniqueList(SenseEntrySchema, (entry) => entry.type, "Each sense once"),
  speeds: uniqueList(SpeedEntrySchema, (entry) => entry.mode, "Each movement mode once"),
  defenses: uniqueList(
    DefenseEntrySchema,
    (entry) => `${entry.type}:${entry.target}`,
    "Each defense once",
  ),
  combat: CombatSchema,
  traits: uniqueList(TraitEntrySchema, (entry) => entry.key, "Trait keys must be unique"),
  appearance: AppearanceSchema,
  personality: PersonalitySchema,
  wallet: WalletSchema,
  loot: uniqueList(LootEntrySchema, (entry) => entry.key, "Loot keys must be unique").refine(
    (entries) =>
      uniqueBy(
        entries.filter((entry) => entry.kind === "CARRIED_ITEM"),
        (entry) => entry.itemInstanceId,
      ),
    { message: "Each carried item once; use quantity for part of a stack" },
  ),
});

export type ActorParts = z.infer<typeof ActorPartsSchema>;
export type AbilityEntry = z.infer<typeof AbilityEntrySchema>;
export type LootEntry = z.infer<typeof LootEntrySchema>;
export type TraitEntry = z.infer<typeof TraitEntrySchema>;

/** Values of new actors for parts they don't send. */
export const DEFAULT_ACTOR_PARTS: ActorParts = {
  abilities: DEFAULT_ABILITIES,
  skills: [],
  proficiencies: [],
  languages: [],
  senses: [],
  speeds: [{ mode: "WALK", distanceFeet: 30, hover: false, notes: null }],
  defenses: [],
  combat: CombatSchema.parse({}),
  traits: [],
  appearance: AppearanceSchema.parse({}),
  personality: PersonalitySchema.parse({}),
  wallet: WalletSchema.parse({}),
  loot: [],
};
