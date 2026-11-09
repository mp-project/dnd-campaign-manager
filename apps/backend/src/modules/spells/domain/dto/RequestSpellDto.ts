import { z } from "zod";

import { booleanQueryDto, paginationDto, uuidDto } from "#core/http/dto";
import { EFFECT_PAYLOAD_TYPES } from "#core/rules/contracts";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { featureKeyDto } from "#src/modules/features/index";
import { SpellBaseSchema } from "#src/modules/spells/domain/dto/BaseSpellDto";
import { SPELL_MAX_CHARACTER_LEVEL } from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import { SPELL_MAX_LEVEL } from "#src/modules/spells/domain/entities/SpellsTable";

export const SPELL_COMPONENTS = ["VERBAL", "SOMATIC", "MATERIAL"] as const;

export const RequestCampaignParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignSpellParamsSchema = RequestCampaignParamsSchema.extend({
  spellId: uuidDto,
});

export const RequestSystemSpellParamsSchema = z.strictObject({
  spellId: uuidDto,
});

/** Params of routes shared by custom and global content; without a campaign it is global. */
export const RequestScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestSpellParamsSchema = RequestScopeParamsSchema.extend({
  spellId: uuidDto,
});

const levelQueryDto = z.coerce.number().int().min(0).max(SPELL_MAX_LEVEL);

const listFilterShape = SpellBaseSchema.pick({ school: true, status: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
    level: levelQueryDto.optional(),
    /** Spells up to this level, cantrips included. */
    maxLevel: levelQueryDto.optional(),
    ritual: booleanQueryDto.optional(),
    concentration: booleanQueryDto.optional(),
    /** Spells that need this component. */
    component: z.enum(SPELL_COMPONENTS).optional(),
    /** Spells with an effect of this payload type. */
    effect: z.enum(EFFECT_PAYLOAD_TYPES).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active spells they may see. */
export const RequestCampaignSpellsQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/**
 * The catalog shows global spells for the campaign ruleset and the campaign's own ones. `list`
 * (a spell list id) keeps the spells of that list in the campaign: its own entries and the spells
 * that name it; `class` (a class id) does the same for the spell list of the class.
 */
export const RequestSpellCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({
    scope: AssetBaseSchema.shape.scope.optional(),
    list: uuidDto.optional(),
    class: uuidDto.optional(),
  })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemSpellsQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

/**
 * What the caster brings, to resolve a spell without storing anything. `slotLevel` is the slot the
 * spell is cast with: none for cantrips, otherwise at least the spell level (default). Missing
 * caster values make the numbers that need them unknown.
 */
export const ResolveSpellSchema = z.strictObject({
  characterLevel: z.number().int().min(1).max(SPELL_MAX_CHARACTER_LEVEL).default(1),
  slotLevel: z.number().int().min(1).max(SPELL_MAX_LEVEL).nullable().default(null),
  caster: z
    .strictObject({
      modifier: z.number().int().min(-10).max(20).optional(),
      attackBonus: z.number().int().min(-10).max(40).optional(),
      saveDc: z.number().int().min(1).max(40).optional(),
      proficiencyBonus: z.number().int().min(0).max(10).optional(),
    })
    .default({}),
  /** Answers to the spell's choices by key: option codes, or asset ids for filtered choices. */
  choices: z.record(featureKeyDto, z.array(z.string().min(1).max(100)).max(20)).default({}),
});

export type RequestCampaignSpellsQueryDto = z.infer<typeof RequestCampaignSpellsQuerySchema>;
export type RequestSpellCatalogQueryDto = z.infer<typeof RequestSpellCatalogQuerySchema>;
export type RequestSystemSpellsQueryDto = z.infer<typeof RequestSystemSpellsQuerySchema>;
export type ResolveSpellDto = z.infer<typeof ResolveSpellSchema>;

// ---------------------------------------------------------------------------
// Spell lists
// ---------------------------------------------------------------------------

export const RequestCampaignSpellListParamsSchema = RequestCampaignParamsSchema.extend({
  spellListId: uuidDto,
});

export const RequestSystemSpellListParamsSchema = z.strictObject({
  spellListId: uuidDto,
});

export const RequestSpellListParamsSchema = RequestScopeParamsSchema.extend({
  spellListId: uuidDto,
});

const spellListFilterShape = {
  search: z.string().trim().min(1).max(200).optional(),
  status: SpellBaseSchema.shape.status.optional(),
};

export const RequestCampaignSpellListsQuerySchema = z
  .strictObject(spellListFilterShape)
  .extend(paginationDto.shape);

export const RequestSpellListCatalogQuerySchema = z
  .strictObject(spellListFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

export const RequestSystemSpellListsQuerySchema = z
  .strictObject(spellListFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

export type RequestCampaignSpellListsQueryDto = z.infer<typeof RequestCampaignSpellListsQuerySchema>;
export type RequestSpellListCatalogQueryDto = z.infer<typeof RequestSpellListCatalogQuerySchema>;
export type RequestSystemSpellListsQueryDto = z.infer<typeof RequestSystemSpellListsQuerySchema>;
