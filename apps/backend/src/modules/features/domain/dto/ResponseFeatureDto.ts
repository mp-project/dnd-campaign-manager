import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { campaignFactValues } from "#core/rules/campaignFacts";
import { ADVANTAGE_MODES, DIE_FACES } from "#core/rules/contracts";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { FeatureBaseSchema } from "#src/modules/features/domain/dto/BaseFeatureDto";
import {
  type FeatureGraph,
  FeatureSectionSchema,
} from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import type { ResolvedFeatureGraph } from "#src/modules/features/domain/FeatureResolver";
import type {
  FeaturePage,
  FeatureRecord,
  FeatureWithAsset,
} from "#src/modules/features/domain/repository/FeaturesRepository";
import { parseFeatureGraph } from "#src/modules/features/history/TrackedFeature";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

const ResponseSectionSchema = FeatureSectionSchema.extend({ contentHtml: htmlDto });

const graphResponseShape = {
  ...FeatureBaseSchema.pick({
    parameters: true,
    choices: true,
    resources: true,
    scalingTracks: true,
    activations: true,
    effects: true,
    supersedes: true,
  }).shape,
  sections: z.array(ResponseSectionSchema),
};

/**
 * View for those who may change the feature, and for GMs reading global features. `version` and
 * the audit fields belong to the feature, `assetVersion` to its asset; changes send both back.
 */
export const ResponseFeatureGmSchema = baseEntityResponseDto
  .extend(
    FeatureBaseSchema.pick({
      assetId: true,
      campaignId: true,
      scope: true,
      name: true,
      summary: true,
      status: true,
      code: true,
      featureType: true,
      description: true,
      stackingMode: true,
      sourceReference: true,
      rulesetPolicy: true,
      rulesetIds: true,
      assetFamilyId: true,
    }).shape,
  )
  .extend(graphResponseShape)
  .extend({
    view: z.literal("GM"),
    assetVersion: z.number().int().positive(),
    descriptionHtml: htmlDto.nullable(),
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateFeatureSchema = ResponseFeatureGmSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players, also the content of a share. Strict, so nothing else can leave the server: no
 * audit data or rulesets, and references to assets the player may not see are left out.
 */
export const ResponseFeaturePlayerSchema = FeatureBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  featureType: true,
  description: true,
  stackingMode: true,
})
  .extend(graphResponseShape)
  .extend({
    view: z.literal("PLAYER"),
    descriptionHtml: htmlDto.nullable(),
  });

export const ResponseFeatureSchema = z.discriminatedUnion("view", [
  ResponseFeatureGmSchema,
  ResponseFeaturePlayerSchema,
]);

/** List entry for GMs and editors: everything to sort and pick a feature, but no definition. */
export const ResponseFeatureListItemGmSchema = ResponseFeatureGmSchema.pick({
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
  featureType: true,
  stackingMode: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
});

export const ResponseFeatureListItemPlayerSchema = ResponseFeaturePlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  featureType: true,
  stackingMode: true,
});

export const ResponseFeatureListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [
    ResponseFeatureListItemGmSchema,
    ResponseFeatureListItemPlayerSchema,
  ]),
);

export const ResponseFeatureValidationSchema = z.strictObject({
  featureId: uuidDto,
  valid: z.boolean(),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

const nullableNumber = z.number().nullable();
const resolvedDice = z
  .strictObject({ count: nullableNumber, faces: z.literal([...DIE_FACES]) })
  .nullable();

const ResolvedPayloadSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("MODIFIER"), stat: z.string(), amount: nullableNumber }),
  z.strictObject({ type: z.literal("BASE_VALUE"), stat: z.string(), value: nullableNumber }),
  z.strictObject({ type: z.literal("GRANT"), grantType: z.string(), value: z.string() }),
  z.strictObject({ type: z.literal("ADVANTAGE"), mode: z.enum(ADVANTAGE_MODES), on: z.string() }),
  z.strictObject({ type: z.literal("RESOURCE"), resourceKey: z.string(), amount: nullableNumber }),
  z.strictObject({
    type: z.literal("DAMAGE"),
    damageType: z.string(),
    dice: resolvedDice,
    amount: nullableNumber,
  }),
  z.strictObject({ type: z.literal("HEAL"), dice: resolvedDice, amount: nullableNumber }),
  z.strictObject({ type: z.literal("MOVEMENT"), mode: z.string(), distance: nullableNumber }),
  z.strictObject({ type: z.literal("INFORMATION"), message: z.string() }),
]);

/** Values of one feature for one actor; nothing about the actor is stored. */
export const ResponseResolvedFeatureSchema = z.strictObject({
  featureId: uuidDto,
  assetId: uuidDto,
  version: z.number().int().positive(),
  assetVersion: z.number().int().positive(),
  rulesetId: uuidDto,
  resolved: z.literal(true),
  parameters: z.array(
    z.strictObject({
      key: z.string(),
      value: z.json().nullable(),
      source: z.enum(["BINDING", "DEFAULT", "NONE"]),
    }),
  ),
  choices: z.array(
    z.strictObject({
      key: z.string(),
      selections: z.array(
        z.strictObject({
          code: z.string().nullable(),
          label: z.string().nullable(),
          value: z.json().nullable(),
          assetId: uuidDto.nullable(),
        }),
      ),
    }),
  ),
  scaling: z.array(
    z.strictObject({ key: z.string(), level: z.number().nullable(), value: z.json().nullable() }),
  ),
  resources: z.array(
    z.strictObject({
      key: z.string(),
      name: z.string(),
      maximum: nullableNumber,
      recovery: z.string(),
    }),
  ),
  activations: z.array(
    z.strictObject({
      key: z.string(),
      activationType: z.string(),
      trigger: z.string().nullable(),
      concentration: z.boolean(),
      duration: z.strictObject({ unit: z.string(), amount: nullableNumber }).nullable(),
      costs: z.array(
        z.strictObject({
          costType: z.string(),
          resourceKey: z.string().nullable(),
          amount: nullableNumber,
        }),
      ),
    }),
  ),
  effects: z.array(
    z.strictObject({
      key: z.string(),
      activationKey: z.string().nullable(),
      effectType: z.string(),
      applies: z.enum(campaignFactValues),
      payload: ResolvedPayloadSchema,
    }),
  ),
  reasons: z.array(z.string()),
});

export type ResponseFeatureGmDto = z.infer<typeof ResponseFeatureGmSchema>;
export type ResponseUpdateFeatureDto = z.infer<typeof ResponseUpdateFeatureSchema>;
export type ResponseFeaturePlayerDto = z.infer<typeof ResponseFeaturePlayerSchema>;
export type ResponseFeatureDto = z.infer<typeof ResponseFeatureSchema>;
export type ResponseFeatureListDto = z.infer<typeof ResponseFeatureListSchema>;
export type ResponseFeatureListItemGmDto = z.infer<typeof ResponseFeatureListItemGmSchema>;
export type ResponseFeatureListItemPlayerDto = z.infer<typeof ResponseFeatureListItemPlayerSchema>;
export type ResponseFeatureValidationDto = z.infer<typeof ResponseFeatureValidationSchema>;
export type ResponseResolvedFeatureDto = z.infer<typeof ResponseResolvedFeatureSchema>;

const renderDescription = (description: string | null) =>
  description === null ? null : renderSafeMarkdown("MARKDOWN", description);

function toGraphResponse(graph: FeatureGraph) {
  return {
    sections: [...graph.sections]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((section) => ({
        ...section,
        contentHtml: renderSafeMarkdown("MARKDOWN", section.content),
      })),
    parameters: graph.parameters,
    choices: graph.choices,
    resources: graph.resources,
    scalingTracks: graph.scalingTracks,
    activations: graph.activations,
    effects: graph.effects,
    supersedes: graph.supersedes,
  };
}

export function toFeatureGmResponse({ feature, asset, rulesetIds }: FeatureRecord): ResponseFeatureGmDto {
  return {
    view: "GM",
    id: feature.id,
    version: feature.version,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
    deletedAt: feature.deletedAt?.toISOString() ?? null,
    createdBy: feature.createdBy,
    updatedBy: feature.updatedBy,
    assetId: feature.assetId,
    assetVersion: asset.version,
    campaignId: feature.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    code: feature.code,
    featureType: feature.featureType,
    description: feature.description,
    descriptionHtml: renderDescription(feature.description),
    stackingMode: feature.stackingMode,
    sourceReference: (asset.sourceReference as Record<string, unknown> | null) ?? null,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    ...toGraphResponse(parseFeatureGraph(feature)),
  };
}

/**
 * `isVisible` tells whether the player may see a referenced asset. Hidden supersede targets are
 * left out; options and defaults keep their place without the hidden asset.
 */
export function toFeaturePlayerResponse(
  { feature, asset }: FeatureWithAsset,
  isVisible: (assetId: string) => boolean,
): ResponseFeaturePlayerDto {
  const graph = parseFeatureGraph(feature);

  return {
    view: "PLAYER",
    id: feature.id,
    assetId: feature.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: feature.code,
    featureType: feature.featureType,
    description: feature.description,
    descriptionHtml: renderDescription(feature.description),
    stackingMode: feature.stackingMode,
    ...toGraphResponse({
      ...graph,
      parameters: graph.parameters.map((parameter) =>
        parameter.valueType === "ASSET_REF" &&
        typeof parameter.defaultValue === "string" &&
        !isVisible(parameter.defaultValue)
          ? { ...parameter, defaultValue: null }
          : parameter,
      ),
      choices: graph.choices.map((choice) => ({
        ...choice,
        options: choice.options.map((option) =>
          option.linkedAssetId && !isVisible(option.linkedAssetId)
            ? { ...option, linkedAssetId: null }
            : option,
        ),
      })),
      supersedes: graph.supersedes.filter((item) => isVisible(item.targetAssetId)),
    }),
  };
}

export function toFeatureListItemGmResponse({
  feature,
  asset,
  rulesetIds,
}: FeatureRecord): ResponseFeatureListItemGmDto {
  return {
    view: "GM",
    id: feature.id,
    version: feature.version,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
    deletedAt: feature.deletedAt?.toISOString() ?? null,
    createdBy: feature.createdBy,
    updatedBy: feature.updatedBy,
    assetId: feature.assetId,
    assetVersion: asset.version,
    campaignId: feature.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    code: feature.code,
    featureType: feature.featureType,
    stackingMode: feature.stackingMode,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
  };
}

export function toFeatureListItemPlayerResponse({
  feature,
  asset,
}: FeatureWithAsset): ResponseFeatureListItemPlayerDto {
  return {
    view: "PLAYER",
    id: feature.id,
    assetId: feature.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: feature.code,
    featureType: feature.featureType,
    stackingMode: feature.stackingMode,
  };
}

export function toFeatureListResponse(params: {
  page: FeaturePage;
  data: ResponseFeatureListDto["data"];
  limit: number;
}): ResponseFeatureListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.feature.code, id: last.feature.id })
        : null,
  });
}

export function toResolvedFeatureResponse(
  record: FeatureWithAsset,
  rulesetId: string,
  resolved: ResolvedFeatureGraph,
): ResponseResolvedFeatureDto {
  return {
    featureId: record.feature.id,
    assetId: record.asset.id,
    version: record.feature.version,
    assetVersion: record.asset.version,
    rulesetId,
    ...resolved,
    parameters: resolved.parameters.map((parameter) => ({
      ...parameter,
      value: (parameter.value ?? null) as z.infer<ReturnType<typeof z.json>>,
    })),
  } as ResponseResolvedFeatureDto;
}
