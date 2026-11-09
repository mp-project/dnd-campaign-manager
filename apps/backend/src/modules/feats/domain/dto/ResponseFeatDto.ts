import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { ResponseResolvedFeatureSchema } from "#src/modules/features/index";
import { FeatBaseSchema } from "#src/modules/feats/domain/dto/BaseFeatDto";
import {
  FeatChoiceOptionSchema,
  FeatChoiceViewSchema,
  type FeatDefinition,
  FeatFeatureGrantViewSchema,
  GRANT_OPERATIONS,
  PREREQUISITE_NODE_TYPES,
  PrerequisiteNodeViewSchema,
  REPEATABILITY_MODES,
} from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import { FEAT_CATEGORIES } from "#src/modules/feats/domain/entities/FeatsTable";
import {
  toPlayerChoices,
  toPlayerGrants,
  toPlayerPrerequisites,
} from "#src/modules/feats/domain/FeatDefinition";
import type {
  FeatPage,
  FeatRecord,
  FeatRow,
  FeatWithAsset,
} from "#src/modules/feats/domain/repository/FeatsRepository";
import { readFeatDefinition } from "#src/modules/feats/history/TrackedFeat";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the feat may be taken anew: only active ones. Archived feats appear while the campaign
 * still uses them, but cannot be chosen anymore.
 */
const selectableDto = z.boolean();

const viewDto = z.enum(["FULL", "PLAYER"]);

const coreShape = FeatBaseSchema.pick({
  code: true,
  description: true,
  category: true,
  minimumCharacterLevel: true,
  prerequisiteCheckMode: true,
  displayOrder: true,
}).shape;

const definitionShape = FeatBaseSchema.pick({
  prerequisites: true,
  repeatability: true,
  choices: true,
  featureGrants: true,
}).shape;

const renderedShape = { descriptionHtml: htmlDto.nullable(), selectable: selectableDto };

/**
 * View for those who may change the feat. `version` and the audit fields belong to the feat,
 * `assetVersion` to its asset; changes send both back.
 */
export const ResponseFeatFullSchema = baseEntityResponseDto
  .extend(
    FeatBaseSchema.pick({
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
  .extend(definitionShape)
  .extend({
    view: z.literal("FULL"),
    assetVersion: z.number().int().positive(),
    ...renderedShape,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateFeatSchema = ResponseFeatFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, no grants or options of assets the player may not see, and hidden prerequisites
 * without their asset.
 */
export const ResponseFeatPlayerSchema = FeatBaseSchema.pick({
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
    prerequisites: PrerequisiteNodeViewSchema.nullable(),
    choices: z.array(FeatChoiceViewSchema),
    featureGrants: z.array(FeatFeatureGrantViewSchema),
    ...renderedShape,
  });

export const ResponseFeatSchema = z.discriminatedUnion("view", [
  ResponseFeatFullSchema,
  ResponseFeatPlayerSchema,
]);

const listSummaryShape = {
  repeatabilityMode: z.enum(REPEATABILITY_MODES).nullable(),
  hasPrerequisites: z.boolean(),
};

/** List entry for GMs and editors: everything to sort and pick a feat, but no definition. */
export const ResponseFeatListItemFullSchema = ResponseFeatFullSchema.pick({
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
  category: true,
  minimumCharacterLevel: true,
  displayOrder: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseFeatListItemPlayerSchema = ResponseFeatPlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  category: true,
  minimumCharacterLevel: true,
  displayOrder: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseFeatListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseFeatListItemFullSchema, ResponseFeatListItemPlayerSchema]),
);

const issueDto = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const ResponseFeatValidationSchema = z.strictObject({
  featId: uuidDto,
  valid: z.boolean(),
  issues: z.array(issueDto),
});

/** The categories feats of the campaign ruleset may have (2014: only GENERAL). */
export const ResponseFeatCategoriesSchema = z.strictObject({
  rulesetId: uuidDto,
  editionYear: z.number().int().nullable(),
  categories: z.array(z.enum(FEAT_CATEGORIES)),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail, eligibility and resolution
// ---------------------------------------------------------------------------

const sectionHeader = { featId: uuidDto, assetId: uuidDto, view: viewDto };

export const ResponseFeatPrerequisitesSchema = z.strictObject({
  ...sectionHeader,
  minimumCharacterLevel: FeatBaseSchema.shape.minimumCharacterLevel,
  prerequisiteCheckMode: FeatBaseSchema.shape.prerequisiteCheckMode,
  prerequisites: PrerequisiteNodeViewSchema.nullable(),
});

export const ResponseFeatChoicesSchema = z.strictObject({
  ...sectionHeader,
  repeatability: FeatBaseSchema.shape.repeatability,
  choices: z.array(FeatChoiceViewSchema),
});

export const ResponseFeatFeaturesSchema = z.strictObject({
  ...sectionHeader,
  grants: z.array(FeatFeatureGrantViewSchema),
});

export const ResponseFeatEligibilitySchema = z.strictObject({
  ...sectionHeader,
  outcome: z.enum(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"]),
  eligible: z.boolean(),
  reasons: z.array(
    z.strictObject({
      code: z.enum(["PREREQUISITE", "MINIMUM_LEVEL", "CATEGORY", "REPEATABILITY", "STATUS"]),
      nodeType: z.enum(PREREQUISITE_NODE_TYPES).nullable(),
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
      assetId: uuidDto.nullable(),
    }),
  ),
  /** Facts the snapshot did not answer; the check is `UNKNOWN` until they are sent. */
  unknownFacts: z.array(z.string()),
  allowedChoices: z.array(
    FeatChoiceViewSchema.pick({
      key: true,
      label: true,
      choiceType: true,
      minimumSelections: true,
      maximumSelections: true,
      dependsOnChoiceKey: true,
      optionFilter: true,
    }).extend({
      options: z.array(FeatChoiceOptionSchema),
      excludedValues: z.array(z.string()),
    }),
  ),
});

/** Checked choices with every granted feature resolved and the passive effects added up. */
export const ResponseFeatResolutionSchema = z.strictObject({
  ...sectionHeader,
  characterLevel: z.number().int(),
  choices: z.record(z.string(), z.array(z.string())),
  grants: z.array(
    z.strictObject({
      key: z.string(),
      featureAssetId: uuidDto,
      operation: z.enum(GRANT_OPERATIONS),
      targetFeatureAssetId: uuidDto.nullable(),
      /** `DUPLICATE` when the feature's stacking mode drops it next to another grant. */
      status: z.enum(["APPLIED", "UPGRADED", "REPLACED", "LOCKED", "DUPLICATE"]),
      resolved: ResponseResolvedFeatureSchema.nullable(),
    }),
  ),
  totals: z.strictObject({
    modifiers: z.record(z.string(), z.number()),
    baseValues: z.record(z.string(), z.number()),
    grants: z.array(z.strictObject({ grantType: z.string(), value: z.string() })),
    advantages: z.array(
      z.strictObject({ mode: z.enum(["ADVANTAGE", "DISADVANTAGE"]), on: z.string() }),
    ),
  }),
});

export type ResponseFeatFullDto = z.infer<typeof ResponseFeatFullSchema>;
export type ResponseUpdateFeatDto = z.infer<typeof ResponseUpdateFeatSchema>;
export type ResponseFeatPlayerDto = z.infer<typeof ResponseFeatPlayerSchema>;
export type ResponseFeatDto = z.infer<typeof ResponseFeatSchema>;
export type ResponseFeatListDto = z.infer<typeof ResponseFeatListSchema>;
export type ResponseFeatListItemFullDto = z.infer<typeof ResponseFeatListItemFullSchema>;
export type ResponseFeatListItemPlayerDto = z.infer<typeof ResponseFeatListItemPlayerSchema>;
export type ResponseFeatValidationDto = z.infer<typeof ResponseFeatValidationSchema>;
export type ResponseFeatCategoriesDto = z.infer<typeof ResponseFeatCategoriesSchema>;
export type ResponseFeatPrerequisitesDto = z.infer<typeof ResponseFeatPrerequisitesSchema>;
export type ResponseFeatChoicesDto = z.infer<typeof ResponseFeatChoicesSchema>;
export type ResponseFeatFeaturesDto = z.infer<typeof ResponseFeatFeaturesSchema>;
export type ResponseFeatEligibilityDto = z.infer<typeof ResponseFeatEligibilitySchema>;
export type ResponseFeatResolutionDto = z.infer<typeof ResponseFeatResolutionSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coreOf(row: FeatRow) {
  return {
    code: row.code,
    description: row.description,
    descriptionHtml: row.description === null ? null : renderSafeMarkdown("MARKDOWN", row.description),
    category: row.category,
    minimumCharacterLevel: row.minimumCharacterLevel,
    prerequisiteCheckMode: row.prerequisiteCheckMode,
    displayOrder: row.displayOrder,
  };
}

/** Mode and whether there are prerequisites, read without parsing the whole definition. */
function listSummaryOf(row: FeatRow) {
  const mode = (row.repeatability as { mode?: unknown } | null)?.mode;

  return {
    repeatabilityMode: (REPEATABILITY_MODES as readonly unknown[]).includes(mode)
      ? (mode as (typeof REPEATABILITY_MODES)[number])
      : null,
    hasPrerequisites: row.prerequisites !== null,
  };
}

export function toFeatFullResponse({ feat: row, asset, rulesetIds }: FeatRecord): ResponseFeatFullDto {
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
    ...readFeatDefinition(row),
  };
}

/** The definition as a player sees it; the caller made sure it parses. */
export function toPlayerDefinition(definition: FeatDefinition, isVisible: (assetId: string) => boolean) {
  return {
    prerequisites: toPlayerPrerequisites(definition.prerequisites, isVisible),
    repeatability: definition.repeatability,
    choices: toPlayerChoices(definition.choices, isVisible),
    featureGrants: toPlayerGrants(definition.featureGrants, isVisible),
  };
}

export function toFeatPlayerResponse(
  { feat: row, asset }: FeatWithAsset,
  definition: FeatDefinition,
  isVisible: (assetId: string) => boolean,
): ResponseFeatPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(row),
    ...toPlayerDefinition(definition, isVisible),
  };
}

export function toFeatListItemFullResponse({
  feat: row,
  asset,
  rulesetIds,
}: FeatRecord): ResponseFeatListItemFullDto {
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
    category: row.category,
    minimumCharacterLevel: row.minimumCharacterLevel,
    displayOrder: row.displayOrder,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toFeatListItemPlayerResponse({
  feat: row,
  asset,
}: FeatWithAsset): ResponseFeatListItemPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    category: row.category,
    minimumCharacterLevel: row.minimumCharacterLevel,
    displayOrder: row.displayOrder,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toFeatListResponse(params: {
  page: FeatPage;
  data: ResponseFeatListDto["data"];
  limit: number;
}): ResponseFeatListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.feat.code, id: last.feat.id })
        : null,
  });
}
