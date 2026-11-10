import { z } from "zod";

import type { ContentView } from "#core/content/viewer";
import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import {
  ABILITY_RULE_MODES,
  AbilityRuleSchema,
  type BackgroundDefinition,
  BackgroundFeatureGrantViewSchema,
  BackgroundSectionSchema,
  EquipmentOptionViewSchema,
  FeatGrantViewSchema,
  GRANT_OPERATIONS,
  PROFICIENCY_GRANT_TYPES,
  PROMPT_TYPES,
  PromptTableSchema,
  ProficiencyGrantViewSchema,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import { BackgroundBaseSchema } from "#src/modules/backgrounds/domain/dto/BaseBackgroundDto";
import type {
  BackgroundPage,
  BackgroundRecord,
  BackgroundRow,
  BackgroundWithAsset,
} from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import { readBackgroundDefinition } from "#src/modules/backgrounds/history/TrackedBackground";
import { FEAT_CATEGORIES } from "#src/modules/feats/index";
import { ABILITIES, ResponseResolvedFeatureSchema } from "#src/modules/features/index";
import { itemCurrencyEnum } from "#src/modules/items/index";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the background may be taken anew: only active ones. Archived backgrounds appear while the
 * campaign still uses them, but cannot be chosen anymore.
 */
const selectableDto = z.boolean();

const viewDto = z.enum(["FULL", "PLAYER"]);

const coreShape = BackgroundBaseSchema.pick({
  code: true,
  description: true,
  customizationMode: true,
  displayOrder: true,
}).shape;

/** Parts as stored, without the checks (the player view leaves hidden entries out). */
const definitionViewShape = {
  sections: z.array(BackgroundSectionSchema),
  abilityRule: AbilityRuleSchema,
  proficiencyGrants: z.array(ProficiencyGrantViewSchema),
  featGrants: z.array(FeatGrantViewSchema),
  featureGrants: z.array(BackgroundFeatureGrantViewSchema),
  equipmentOptions: z.array(EquipmentOptionViewSchema),
  promptTables: z.array(z.strictObject(PromptTableSchema.shape)),
};

/** Rendered sections, by key; the stored Markdown stays in `sections`. */
const renderedShape = {
  descriptionHtml: htmlDto.nullable(),
  sectionsHtml: z.array(z.strictObject({ key: z.string(), contentHtml: htmlDto })),
  selectable: selectableDto,
};

/**
 * View for those who may change the background. `version` and the audit fields belong to the
 * background, `assetVersion` to its asset; changes send both back.
 */
export const ResponseBackgroundFullSchema = baseEntityResponseDto
  .extend(
    BackgroundBaseSchema.pick({
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
  )
  .extend(coreShape)
  .extend(definitionViewShape)
  .extend({
    view: z.literal("FULL"),
    assetVersion: z.number().int().positive(),
    ...renderedShape,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateBackgroundSchema = ResponseBackgroundFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, no GM-only sections, and no options, feats, grants or items of assets the player
 * may not see.
 */
export const ResponseBackgroundPlayerSchema = BackgroundBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
})
  .extend(coreShape)
  .extend(definitionViewShape)
  .extend({ view: z.literal("PLAYER"), ...renderedShape });

export const ResponseBackgroundSchema = z.discriminatedUnion("view", [
  ResponseBackgroundFullSchema,
  ResponseBackgroundPlayerSchema,
]);

const listSummaryShape = {
  abilityMode: z.enum(ABILITY_RULE_MODES).nullable(),
  abilities: z.array(z.enum(ABILITIES)),
};

/** List entry for GMs and editors: everything to sort and pick a background, but no definition. */
export const ResponseBackgroundListItemFullSchema = ResponseBackgroundFullSchema.pick({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  view: true,
  assetId: true,
  assetVersion: true,
  campaignId: true,
  scope: true,
  name: true,
  summary: true,
  status: true,
  code: true,
  customizationMode: true,
  displayOrder: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseBackgroundListItemPlayerSchema = ResponseBackgroundPlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  customizationMode: true,
  displayOrder: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseBackgroundListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [
    ResponseBackgroundListItemFullSchema,
    ResponseBackgroundListItemPlayerSchema,
  ]),
);

const issueDto = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const ResponseBackgroundValidationSchema = z.strictObject({
  backgroundId: uuidDto,
  valid: z.boolean(),
  issues: z.array(issueDto),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail
// ---------------------------------------------------------------------------

export const BACKGROUND_SECTIONS = [
  "abilities",
  "proficiencies",
  "feats",
  "features",
  "equipment",
  "prompts",
] as const;

export type BackgroundSection = (typeof BACKGROUND_SECTIONS)[number];

const sectionHeader = { backgroundId: uuidDto, assetId: uuidDto, view: viewDto };

export const ResponseBackgroundSectionSchemas = {
  abilities: z.strictObject({ ...sectionHeader, abilityRule: AbilityRuleSchema }),
  proficiencies: z.strictObject({
    ...sectionHeader,
    customizationMode: BackgroundBaseSchema.shape.customizationMode,
    grants: definitionViewShape.proficiencyGrants,
  }),
  feats: z.strictObject({ ...sectionHeader, grants: definitionViewShape.featGrants }),
  features: z.strictObject({ ...sectionHeader, grants: definitionViewShape.featureGrants }),
  equipment: z.strictObject({ ...sectionHeader, options: definitionViewShape.equipmentOptions }),
  prompts: z.strictObject({ ...sectionHeader, tables: definitionViewShape.promptTables }),
} as const;

export type ResponseBackgroundSectionDto = z.infer<
  (typeof ResponseBackgroundSectionSchemas)[BackgroundSection]
>;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const currencyDto = z.partialRecord(z.enum(itemCurrencyEnum.enumValues), z.number().int());

/**
 * What the background gives a character with these choices, without storing anything: every value
 * names where it comes from (`sourceAssetId`, the grant key), so the character modules can store
 * and later remove exactly what this background gave.
 */
export const ResponseBackgroundResolutionSchema = z.strictObject({
  ...sectionHeader,
  sourceAssetId: uuidDto,
  selectionMode: z.enum(["STANDARD", "RULESET_CUSTOMIZED"]),
  characterLevel: z.number().int(),
  abilityIncreases: z.partialRecord(z.enum(ABILITIES), z.number().int()),
  proficiencies: z.array(
    z.strictObject({
      type: z.enum(PROFICIENCY_GRANT_TYPES),
      code: z.string().nullable(),
      assetId: uuidDto.nullable(),
      proficiencyKey: z.string(),
      grantKey: z.string().nullable(),
    }),
  ),
  feats: z.array(
    z.strictObject({
      grantKey: z.string(),
      featAssetId: uuidDto,
      chosen: z.boolean(),
      /** Feat choices are resolved by the feats module (`.../catalog/feats/:featId/resolve`). */
      featId: uuidDto,
    }),
  ),
  features: z.array(
    z.strictObject({
      key: z.string(),
      featureAssetId: uuidDto,
      operation: z.enum(GRANT_OPERATIONS),
      targetFeatureAssetId: uuidDto.nullable(),
      /** The background the feature comes from: this one, or the one of a 2014 customization. */
      sourceAssetId: uuidDto,
      status: z.enum(["APPLIED", "UPGRADED", "REPLACED", "LOCKED", "DUPLICATE"]),
      resolved: ResponseResolvedFeatureSchema.nullable(),
    }),
  ),
  totals: z.strictObject({
    modifiers: z.record(z.string(), z.number()),
    baseValues: z.record(z.string(), z.number()),
    grants: z.array(z.strictObject({ grantType: z.string(), value: z.string() })),
    advantages: z.array(z.strictObject({ mode: z.enum(["ADVANTAGE", "DISADVANTAGE"]), on: z.string() })),
  }),
  equipment: z
    .strictObject({
      optionCode: z.string(),
      /** Item instances the character modules would create, owned by the character. */
      items: z.array(z.strictObject({ entryKey: z.string(), itemAssetId: uuidDto, quantity: z.number().int() })),
      /** Coins added to the character's wallet. */
      walletDelta: currencyDto,
    })
    .nullable(),
  /** Suggestions for the character profile. */
  prompts: z.array(
    z.strictObject({
      tableKey: z.string(),
      promptType: z.enum(PROMPT_TYPES),
      text: z.string(),
      roll: z.number().int().nullable(),
      custom: z.boolean(),
    }),
  ),
  /** Not errors: things the character modules or the player should look at. */
  conflicts: z.array(
    z.strictObject({
      code: z.enum(["DUPLICATE_PROFICIENCY", "DUPLICATE_FEAT"]),
      proficiencyKey: z.string().nullable(),
      featAssetId: uuidDto.nullable(),
      message: z.string(),
    }),
  ),
});

const featOptionDto = z.strictObject({
  featAssetId: uuidDto,
  featId: uuidDto,
  name: z.string(),
  category: z.enum(FEAT_CATEGORIES),
  repeatabilityMode: z.string(),
});

/**
 * The feats each feat grant offers to a character: for a choice only feats the campaign may use
 * that the character may still take (not taken already, not granted by this background, unless
 * repeatable); a fixed grant names its feat and whether the character may still take it.
 */
export const ResponseBackgroundFeatOptionsSchema = z.strictObject({
  ...sectionHeader,
  grants: z.array(
    z.strictObject({
      grantKey: z.string(),
      selectionMode: z.enum(["FIXED", "CHOOSE"]),
      options: z.array(featOptionDto.extend({ available: z.boolean() })),
      /** Choices only: more feats fit than are listed. */
      truncated: z.boolean(),
    }),
  ),
});

export type ResponseBackgroundFullDto = z.infer<typeof ResponseBackgroundFullSchema>;
export type ResponseUpdateBackgroundDto = z.infer<typeof ResponseUpdateBackgroundSchema>;
export type ResponseBackgroundPlayerDto = z.infer<typeof ResponseBackgroundPlayerSchema>;
export type ResponseBackgroundDto = z.infer<typeof ResponseBackgroundSchema>;
export type ResponseBackgroundListDto = z.infer<typeof ResponseBackgroundListSchema>;
export type ResponseBackgroundListItemFullDto = z.infer<typeof ResponseBackgroundListItemFullSchema>;
export type ResponseBackgroundListItemPlayerDto = z.infer<typeof ResponseBackgroundListItemPlayerSchema>;
export type ResponseBackgroundValidationDto = z.infer<typeof ResponseBackgroundValidationSchema>;
export type ResponseBackgroundResolutionDto = z.infer<typeof ResponseBackgroundResolutionSchema>;
export type ResponseBackgroundFeatOptionsDto = z.infer<typeof ResponseBackgroundFeatOptionsSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coreOf(row: BackgroundRow) {
  return {
    code: row.code,
    description: row.description,
    descriptionHtml: row.description === null ? null : renderSafeMarkdown("MARKDOWN", row.description),
    customizationMode: row.customizationMode,
    displayOrder: row.displayOrder,
  };
}

function renderedOf(definition: BackgroundDefinition) {
  return {
    sectionsHtml: definition.sections.map((section) => ({
      key: section.key,
      contentHtml: renderSafeMarkdown("MARKDOWN", section.content),
    })),
  };
}

/** Mode and abilities of the ability rule, read without parsing the whole definition. */
function listSummaryOf(row: BackgroundRow) {
  const rule = (row.abilityRule ?? {}) as {
    mode?: unknown;
    allowedAbilities?: unknown;
    increases?: { ability?: unknown }[];
  };
  const isAbility = (value: unknown): value is (typeof ABILITIES)[number] =>
    (ABILITIES as readonly unknown[]).includes(value);
  const named = Array.isArray(rule.allowedAbilities)
    ? rule.allowedAbilities
    : Array.isArray(rule.increases)
      ? rule.increases.map((increase) => increase?.ability)
      : [];

  return {
    abilityMode: (ABILITY_RULE_MODES as readonly unknown[]).includes(rule.mode)
      ? (rule.mode as (typeof ABILITY_RULE_MODES)[number])
      : null,
    abilities: named.filter(isAbility),
  };
}

export function toBackgroundFullResponse({
  background: row,
  asset,
  rulesetIds,
}: BackgroundRecord): ResponseBackgroundFullDto {
  const definition = readBackgroundDefinition(row);

  return {
    view: "FULL",
    id: row.id,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    assetId: row.assetId,
    assetVersion: asset.version,
    campaignId: row.campaignId,
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
    ...coreOf(row),
    ...definition,
    ...renderedOf(definition),
  };
}

/** The player response; `definition` is already the player view (`toPlayerDefinition`). */
export function toBackgroundPlayerResponse(
  { background: row, asset }: BackgroundWithAsset,
  definition: BackgroundDefinition,
): ResponseBackgroundPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(row),
    ...definition,
    ...renderedOf(definition),
  };
}

export function toBackgroundListItemFullResponse({
  background: row,
  asset,
  rulesetIds,
}: BackgroundRecord): ResponseBackgroundListItemFullDto {
  return {
    view: "FULL",
    id: row.id,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    assetId: row.assetId,
    assetVersion: asset.version,
    campaignId: row.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    code: row.code,
    customizationMode: row.customizationMode,
    displayOrder: row.displayOrder,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toBackgroundListItemPlayerResponse({
  background: row,
  asset,
}: BackgroundWithAsset): ResponseBackgroundListItemPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    customizationMode: row.customizationMode,
    displayOrder: row.displayOrder,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toBackgroundListResponse(params: {
  page: BackgroundPage;
  data: ResponseBackgroundListDto["data"];
  limit: number;
}): ResponseBackgroundListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.background.code, id: last.background.id })
        : null,
  });
}

/** One section of the catalog detail; `definition` is as the viewer may see it. */
export function toBackgroundSectionResponse(
  section: BackgroundSection,
  found: BackgroundWithAsset,
  view: ContentView,
  definition: BackgroundDefinition,
): ResponseBackgroundSectionDto {
  const header = { backgroundId: found.background.id, assetId: found.asset.id, view };

  switch (section) {
    case "abilities":
      return { ...header, abilityRule: definition.abilityRule };
    case "proficiencies":
      return {
        ...header,
        customizationMode: found.background.customizationMode,
        grants: definition.proficiencyGrants,
      };
    case "feats":
      return { ...header, grants: definition.featGrants };
    case "features":
      return { ...header, grants: definition.featureGrants };
    case "equipment":
      return { ...header, options: definition.equipmentOptions };
    case "prompts":
      return { ...header, tables: definition.promptTables };
  }
}
