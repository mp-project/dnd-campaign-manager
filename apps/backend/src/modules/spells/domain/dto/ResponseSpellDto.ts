import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { campaignFactValues } from "#core/rules/campaignFacts";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import type { AssetRow } from "#src/modules/assets/index";
import { ResolvedPayloadSchema } from "#src/modules/features/index";
import { SpellBaseSchema, SpellListBaseSchema } from "#src/modules/spells/domain/dto/BaseSpellDto";
import {
  EFFECT_RESOLUTIONS,
  SAVE_OUTCOMES,
  SPELL_SCALE_BY,
  SPELL_SCALING_VALUE_TYPES,
  SpellChoiceViewSchema,
  type SpellDefinition,
  SpellEffectSchema,
  SpellMaterialSchema,
  SpellScalingTrackSchema,
  SpellTargetSchema,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import {
  encodeSpellSortValue,
  type SpellListPage,
  type SpellListRecord,
  type SpellListWithAsset,
  type SpellPage,
  type SpellRecord,
  type SpellRow,
  type SpellWithAsset,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import type { ResolvedSpellCast } from "#src/modules/spells/domain/SpellCasting";
import { toPlayerChoices } from "#src/modules/spells/domain/SpellDefinition";
import {
  readSpellDefinition,
  storedSpellIds,
  storedSpellListIds,
} from "#src/modules/spells/history/TrackedSpell";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the content may be newly used: only active content. Archived content appears while the
 * campaign still uses it, but can't be chosen anymore.
 */
const selectableDto = z.boolean();

const viewDto = z.enum(["FULL", "PLAYER"]);

const assetResponseShape = {
  ...baseEntityResponseDto.shape,
  assetVersion: z.number().int().positive(),
  ...SpellBaseSchema.pick({
    assetId: true,
    campaignId: true,
    scope: true,
    name: true,
    summary: true,
    status: true,
    sourceReference: true,
    rulesetPolicy: true,
    rulesetIds: true,
    assetFamilyId: true,
    releasedToPlayers: true,
  }).shape,
};

const coreShape = SpellBaseSchema.pick({
  code: true,
  level: true,
  school: true,
  description: true,
  higherLevelDescription: true,
  isRitual: true,
  castingTimeType: true,
  castingTimeAmount: true,
  castingTrigger: true,
  rangeType: true,
  rangeDistance: true,
  rangeUnit: true,
  durationType: true,
  durationAmount: true,
  durationUnit: true,
  requiresConcentration: true,
  componentVerbal: true,
  componentSomatic: true,
  componentMaterial: true,
}).shape;

const definitionShape = SpellBaseSchema.pick({
  sections: true,
  materials: true,
  requirements: true,
  targets: true,
  choices: true,
  scalingTracks: true,
  effects: true,
  spellListIds: true,
}).shape;

const renderedSectionDto = SpellBaseSchema.shape.sections.element.extend({ contentHtml: htmlDto });

const renderedShape = {
  descriptionHtml: htmlDto.nullable(),
  higherLevelDescriptionHtml: htmlDto.nullable(),
  sections: z.array(renderedSectionDto),
  selectable: selectableDto,
};

/**
 * View for those who may change the spell. `version` and the audit fields belong to the spell,
 * `assetVersion` to its asset; changes send both back.
 */
export const ResponseSpellFullSchema = z
  .strictObject(assetResponseShape)
  .extend(coreShape)
  .extend(definitionShape)
  .extend({ view: z.literal("FULL"), ...renderedShape });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateSpellSchema = ResponseSpellFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, no options of assets the player may not see and only lists they may see.
 */
export const ResponseSpellPlayerSchema = SpellBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
})
  .extend(coreShape)
  .extend(definitionShape)
  .extend({
    view: z.literal("PLAYER"),
    choices: z.array(SpellChoiceViewSchema),
    spellListIds: z.array(uuidDto),
    ...renderedShape,
  });

export const ResponseSpellSchema = z.discriminatedUnion("view", [
  ResponseSpellFullSchema,
  ResponseSpellPlayerSchema,
]);

const listItemCore = {
  view: true,
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  level: true,
  school: true,
  isRitual: true,
  castingTimeType: true,
  rangeType: true,
  durationType: true,
  requiresConcentration: true,
  componentVerbal: true,
  componentSomatic: true,
  componentMaterial: true,
  selectable: true,
} as const;

/** List entry for GMs and editors: everything to sort and pick a spell, but no definition. */
export const ResponseSpellListItemFullSchema = ResponseSpellFullSchema.pick({
  ...listItemCore,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  assetVersion: true,
  campaignId: true,
  status: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
});

export const ResponseSpellListItemPlayerSchema = ResponseSpellPlayerSchema.pick(listItemCore);

export const ResponseSpellListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseSpellListItemFullSchema, ResponseSpellListItemPlayerSchema]),
);

const issueDto = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const ResponseValidationSchema = z.strictObject({
  id: uuidDto,
  valid: z.boolean(),
  issues: z.array(issueDto),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail and resolution
// ---------------------------------------------------------------------------

const sectionHeader = { spellId: uuidDto, assetId: uuidDto, view: viewDto };

/** Targets, effects and scaling: what the spell does. */
export const ResponseSpellEffectsSchema = z.strictObject({
  ...sectionHeader,
  level: SpellBaseSchema.shape.level,
  targets: z.array(SpellTargetSchema),
  scalingTracks: z.array(SpellScalingTrackSchema),
  effects: z.array(SpellEffectSchema),
});

/** A spell list as a reference: enough to show and pick it. */
const spellListRefDto = z.strictObject({
  id: uuidDto,
  assetId: uuidDto,
  scope: SpellBaseSchema.shape.scope,
  code: SpellBaseSchema.shape.code,
  name: SpellBaseSchema.shape.name,
  /** Whether the list holds the spell as its own entry or the spell names the list. */
  membership: z.enum(["ENTRY", "NAMED_BY_SPELL", "BOTH"]),
});

export const ResponseSpellListsOfSpellSchema = z.strictObject({
  ...sectionHeader,
  lists: z.array(spellListRefDto),
});

/** One cast resolved; nothing is spent or stored. */
export const ResponseSpellResolutionSchema = z.strictObject({
  ...sectionHeader,
  characterLevel: z.number().int(),
  slotLevel: z.number().int().nullable(),
  choices: z.record(z.string(), z.array(z.string())),
  scaling: z.array(
    z.strictObject({
      key: z.string(),
      scaleBy: z.enum(SPELL_SCALE_BY),
      valueType: z.enum(SPELL_SCALING_VALUE_TYPES),
      atLevel: z.number().int(),
      value: z.json(),
    }),
  ),
  effects: z.array(
    z.strictObject({
      key: z.string(),
      targetKey: z.string().nullable(),
      resolution: z.enum(EFFECT_RESOLUTIONS),
      saveAbility: z.string().nullable(),
      onSave: z.enum(SAVE_OUTCOMES).nullable(),
      dependsOnEffectKeys: z.array(z.string()),
      applies: z.enum(campaignFactValues),
      payload: ResolvedPayloadSchema,
      reasons: z.array(z.string()),
    }),
  ),
  /** What the cast would use; the actor modules spend it, this module never does. */
  uses: z.strictObject({
    slotLevel: z.number().int().nullable(),
    canBeCastAsRitual: z.boolean(),
    startsConcentration: z.boolean(),
    consumedMaterials: z.array(SpellMaterialSchema),
  }),
  caster: z.strictObject({
    attackBonus: z.number().int().nullable(),
    saveDc: z.number().int().nullable(),
  }),
});

export type ResponseSpellFullDto = z.infer<typeof ResponseSpellFullSchema>;
export type ResponseUpdateSpellDto = z.infer<typeof ResponseUpdateSpellSchema>;
export type ResponseSpellPlayerDto = z.infer<typeof ResponseSpellPlayerSchema>;
export type ResponseSpellDto = z.infer<typeof ResponseSpellSchema>;
export type ResponseSpellListDto = z.infer<typeof ResponseSpellListSchema>;
export type ResponseValidationDto = z.infer<typeof ResponseValidationSchema>;
export type ResponseSpellEffectsDto = z.infer<typeof ResponseSpellEffectsSchema>;
export type ResponseSpellListsOfSpellDto = z.infer<typeof ResponseSpellListsOfSpellSchema>;
export type ResponseSpellResolutionDto = z.infer<typeof ResponseSpellResolutionSchema>;

// ---------------------------------------------------------------------------
// Spell lists
// ---------------------------------------------------------------------------

const listRenderedShape = { descriptionHtml: htmlDto.nullable(), selectable: selectableDto };

export const ResponseSpellListFullSchema = z
  .strictObject(assetResponseShape)
  .extend(SpellListBaseSchema.pick({ code: true, description: true, spellIds: true }).shape)
  .extend({ view: z.literal("FULL"), ...listRenderedShape });

export const ResponseUpdateSpellListSchema = ResponseSpellListFullSchema.extend({
  merged: z.array(z.string()),
});

/** Players see the list with the entries they may see; spells naming it come with its spells. */
export const ResponseSpellListPlayerSchema = SpellListBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  description: true,
})
  .extend({ view: z.literal("PLAYER"), spellIds: z.array(uuidDto), ...listRenderedShape });

export const ResponseSpellListDetailSchema = z.discriminatedUnion("view", [
  ResponseSpellListFullSchema,
  ResponseSpellListPlayerSchema,
]);

const listListItemCore = {
  view: true,
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  selectable: true,
} as const;

export const ResponseSpellListListItemFullSchema = ResponseSpellListFullSchema.pick({
  ...listListItemCore,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  assetVersion: true,
  campaignId: true,
  status: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
}).extend({ entryCount: z.number().int() });

export const ResponseSpellListListItemPlayerSchema = ResponseSpellListPlayerSchema.pick(listListItemCore);

export const ResponseSpellListListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseSpellListListItemFullSchema, ResponseSpellListListItemPlayerSchema]),
);

export type ResponseSpellListFullDto = z.infer<typeof ResponseSpellListFullSchema>;
export type ResponseUpdateSpellListDto = z.infer<typeof ResponseUpdateSpellListSchema>;
export type ResponseSpellListPlayerDto = z.infer<typeof ResponseSpellListPlayerSchema>;
export type ResponseSpellListDetailDto = z.infer<typeof ResponseSpellListDetailSchema>;
export type ResponseSpellListListDto = z.infer<typeof ResponseSpellListListSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function markdown(value: string | null): string | null {
  return value === null ? null : renderSafeMarkdown("MARKDOWN", value);
}

function auditOf(row: {
  id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string;
  updatedBy: string | null;
}) {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function assetFieldsOf(asset: AssetRow, rulesetIds: readonly string[]) {
  return {
    assetId: asset.id,
    assetVersion: asset.version,
    campaignId: asset.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    sourceReference: (asset.sourceReference as Record<string, unknown> | null) ?? null,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
  };
}

function coreOf(row: SpellRow) {
  return {
    code: row.code,
    level: row.level,
    school: row.school,
    description: row.description,
    descriptionHtml: markdown(row.description),
    higherLevelDescription: row.higherLevelDescription,
    higherLevelDescriptionHtml: markdown(row.higherLevelDescription),
    isRitual: row.isRitual,
    castingTimeType: row.castingTimeType,
    castingTimeAmount: row.castingTimeAmount,
    castingTrigger: row.castingTrigger,
    rangeType: row.rangeType,
    rangeDistance: row.rangeDistance,
    rangeUnit: row.rangeUnit,
    durationType: row.durationType,
    durationAmount: row.durationAmount,
    durationUnit: row.durationUnit,
    requiresConcentration: row.requiresConcentration,
    componentVerbal: row.componentVerbal,
    componentSomatic: row.componentSomatic,
    componentMaterial: row.componentMaterial,
  };
}

function definitionOf(definition: SpellDefinition) {
  return {
    ...definition,
    sections: definition.sections.map((section) => ({
      ...section,
      contentHtml: renderSafeMarkdown("MARKDOWN", section.content),
    })),
  };
}

export function toSpellFullResponse({ spell: row, asset, rulesetIds }: SpellRecord): ResponseSpellFullDto {
  return {
    view: "FULL",
    ...auditOf(row),
    ...assetFieldsOf(asset, rulesetIds),
    ...coreOf(row),
    ...definitionOf(readSpellDefinition(row)),
    spellListIds: storedSpellListIds(row),
  };
}

/** The spell as a player sees it; the caller made sure the definition parses. */
export function toSpellPlayerResponse(
  { spell: row, asset }: SpellWithAsset,
  definition: SpellDefinition,
  isVisible: (assetId: string) => boolean,
): ResponseSpellPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(row),
    ...definitionOf({ ...definition, choices: toPlayerChoices(definition.choices, isVisible) }),
    spellListIds: storedSpellListIds(row).filter(isVisible),
  };
}

function listItemOf({ spell: row, asset }: SpellWithAsset) {
  return {
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    level: row.level,
    school: row.school,
    isRitual: row.isRitual,
    castingTimeType: row.castingTimeType,
    rangeType: row.rangeType,
    durationType: row.durationType,
    requiresConcentration: row.requiresConcentration,
    componentVerbal: row.componentVerbal,
    componentSomatic: row.componentSomatic,
    componentMaterial: row.componentMaterial,
    selectable: asset.status === "ACTIVE",
  };
}

export function toSpellListItemFullResponse(record: SpellRecord) {
  const asset = assetFieldsOf(record.asset, record.rulesetIds);

  return {
    view: "FULL" as const,
    ...auditOf(record.spell),
    ...listItemOf(record),
    assetVersion: asset.assetVersion,
    campaignId: asset.campaignId,
    status: asset.status,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: asset.rulesetIds,
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
  };
}

export function toSpellListItemPlayerResponse(item: SpellWithAsset) {
  return { view: "PLAYER" as const, ...listItemOf(item) };
}

export function toSpellPageResponse(params: {
  page: SpellPage;
  data: ResponseSpellListDto["data"];
  limit: number;
}): ResponseSpellListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: encodeSpellSortValue(last.spell), id: last.spell.id })
        : null,
  });
}

export function toSpellListFullResponse({ spellList: row, asset, rulesetIds }: SpellListRecord): ResponseSpellListFullDto {
  return {
    view: "FULL",
    ...auditOf(row),
    ...assetFieldsOf(asset, rulesetIds),
    code: row.code,
    description: row.description,
    descriptionHtml: markdown(row.description),
    spellIds: storedSpellIds(row),
  };
}

export function toSpellListPlayerResponse(
  { spellList: row, asset }: SpellListWithAsset,
  isVisible: (assetId: string) => boolean,
): ResponseSpellListPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    description: row.description,
    descriptionHtml: markdown(row.description),
    spellIds: storedSpellIds(row).filter(isVisible),
    selectable: asset.status === "ACTIVE",
  };
}

function listListItemOf({ spellList: row, asset }: SpellListWithAsset) {
  return {
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    selectable: asset.status === "ACTIVE",
  };
}

export function toSpellListListItemFullResponse(record: SpellListRecord) {
  const asset = assetFieldsOf(record.asset, record.rulesetIds);

  return {
    view: "FULL" as const,
    ...auditOf(record.spellList),
    ...listListItemOf(record),
    assetVersion: asset.assetVersion,
    campaignId: asset.campaignId,
    status: asset.status,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: asset.rulesetIds,
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    entryCount: storedSpellIds(record.spellList).length,
  };
}

export function toSpellListListItemPlayerResponse(item: SpellListWithAsset) {
  return { view: "PLAYER" as const, ...listListItemOf(item) };
}

export function toSpellListPageResponse(params: {
  page: SpellListPage;
  data: ResponseSpellListListDto["data"];
  limit: number;
}): ResponseSpellListListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.spellList.code, id: last.spellList.id })
        : null,
  });
}

export function toSpellResolutionResponse(
  header: { spellId: string; assetId: string; view: "FULL" | "PLAYER" },
  resolved: ResolvedSpellCast,
): ResponseSpellResolutionDto {
  return { ...header, ...resolved } as ResponseSpellResolutionDto;
}
