import { z } from "zod";

import { baseEntityResponseDto } from "#core/http/dto";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { SpeciesVariantBaseSchema } from "#src/modules/species/domain/dto/BaseSpeciesDto";
import { SpeciesFeatureGrantViewSchema } from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import type {
  SpeciesVariantRecord,
  SpeciesVariantWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import { toPlayerGrants } from "#src/modules/species/domain/SpeciesDefinition";
import { parseVariantGrants } from "#src/modules/species/history/TrackedSpecies";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/** Whether the variant may be chosen anew: only active ones. */
const selectableDto = z.boolean();

const coreShape = SpeciesVariantBaseSchema.pick({
  speciesId: true,
  speciesAssetId: true,
  variantGroupCode: true,
  code: true,
  description: true,
  displayOrder: true,
}).shape;

/**
 * View for those who may change the variant. `version` and the audit fields belong to the variant,
 * `assetVersion` to its asset; changes send both back.
 */
export const ResponseSpeciesVariantFullSchema = baseEntityResponseDto
  .extend(
    SpeciesVariantBaseSchema.pick({
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
      featureGrants: true,
    }).shape,
  )
  .extend(coreShape)
  .extend({
    view: z.literal("FULL"),
    assetVersion: z.number().int().positive(),
    descriptionHtml: htmlDto.nullable(),
    selectable: selectableDto,
  });

export const ResponseUpdateSpeciesVariantSchema = ResponseSpeciesVariantFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players: no audit data, rulesets or release flag, and no grants of features they may
 * not see.
 */
export const ResponseSpeciesVariantPlayerSchema = SpeciesVariantBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
})
  .extend(coreShape)
  .extend({
    view: z.literal("PLAYER"),
    descriptionHtml: htmlDto.nullable(),
    featureGrants: z.array(SpeciesFeatureGrantViewSchema),
    selectable: selectableDto,
  });

export const ResponseSpeciesVariantSchema = z.discriminatedUnion("view", [
  ResponseSpeciesVariantFullSchema,
  ResponseSpeciesVariantPlayerSchema,
]);

export const ResponseSpeciesVariantListSchema = z.strictObject({
  data: z.array(ResponseSpeciesVariantSchema),
});

export type ResponseSpeciesVariantFullDto = z.infer<typeof ResponseSpeciesVariantFullSchema>;
export type ResponseUpdateSpeciesVariantDto = z.infer<typeof ResponseUpdateSpeciesVariantSchema>;
export type ResponseSpeciesVariantPlayerDto = z.infer<typeof ResponseSpeciesVariantPlayerSchema>;
export type ResponseSpeciesVariantDto = z.infer<typeof ResponseSpeciesVariantSchema>;
export type ResponseSpeciesVariantListDto = z.infer<typeof ResponseSpeciesVariantListSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export const renderDescription = (description: string | null) =>
  description === null ? null : renderSafeMarkdown("MARKDOWN", description);

function coreOf({ variant, speciesAssetId }: SpeciesVariantWithAsset) {
  return {
    speciesId: variant.speciesId,
    speciesAssetId,
    variantGroupCode: variant.variantGroupCode,
    code: variant.code,
    description: variant.description,
    descriptionHtml: renderDescription(variant.description),
    displayOrder: variant.displayOrder,
  };
}

export function toSpeciesVariantFullResponse(record: SpeciesVariantRecord): ResponseSpeciesVariantFullDto {
  const { variant, asset, rulesetIds } = record;

  return {
    view: "FULL",
    id: variant.id,
    version: variant.version,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
    deletedAt: variant.deletedAt?.toISOString() ?? null,
    createdBy: variant.createdBy,
    updatedBy: variant.updatedBy,
    assetId: variant.assetId,
    assetVersion: asset.version,
    campaignId: variant.campaignId,
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
    featureGrants: parseVariantGrants(variant),
    ...coreOf(record),
  };
}

export function toSpeciesVariantPlayerResponse(
  found: SpeciesVariantWithAsset,
  isVisible: (assetId: string) => boolean,
): ResponseSpeciesVariantPlayerDto {
  const { variant, asset } = found;

  return {
    view: "PLAYER",
    id: variant.id,
    assetId: variant.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    featureGrants: toPlayerGrants(parseVariantGrants(variant), isVisible),
    ...coreOf(found),
  };
}
