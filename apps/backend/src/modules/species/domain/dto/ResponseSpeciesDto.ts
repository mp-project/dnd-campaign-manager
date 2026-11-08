import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { ResponseResolvedFeatureSchema } from "#src/modules/features/index";
import { SpeciesBaseSchema } from "#src/modules/species/domain/dto/BaseSpeciesDto";
import {
  GRANT_OPERATIONS,
  MovementModeSchema,
  SizeOptionSchema,
  SPECIES_SIZES,
  type SpeciesDefinition,
  SpeciesFeatureGrantViewSchema,
  VariantGroupSchema,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import { renderDescription } from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type {
  SpeciesPage,
  SpeciesRecord,
  SpeciesRow,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import { toPlayerGrants } from "#src/modules/species/domain/SpeciesDefinition";
import { readSpeciesDefinition } from "#src/modules/species/history/TrackedSpecies";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the species may be chosen anew: only active ones. Archived species appear while the
 * campaign still uses them, but cannot be chosen anymore.
 */
const selectableDto = z.boolean();

const viewDto = z.enum(["GM", "PLAYER"]);

const coreShape = SpeciesBaseSchema.pick({
  code: true,
  description: true,
  creatureType: true,
  lifespanMode: true,
  displayOrder: true,
}).shape;

/** Definition parts as stored for those who may change them. */
const definitionShape = SpeciesBaseSchema.pick({
  sizeOptions: true,
  movementModes: true,
  ageProfile: true,
  physicalProfile: true,
  textSections: true,
  variantGroups: true,
  featureGrants: true,
}).shape;

/** Rendered text sections, by key; the stored Markdown stays in `textSections`. */
const textSectionsHtmlDto = z.array(z.strictObject({ key: z.string(), contentHtml: htmlDto }));

const renderedShape = {
  descriptionHtml: htmlDto.nullable(),
  textSectionsHtml: textSectionsHtmlDto,
  selectable: selectableDto,
};

/**
 * View for those who may change the species, and for GMs reading global species. `version` and the
 * audit fields belong to the species, `assetVersion` to its asset; changes send both back.
 */
export const ResponseSpeciesGmSchema = baseEntityResponseDto
  .extend(
    SpeciesBaseSchema.pick({
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
  .extend({ view: z.literal("GM"), assetVersion: z.number().int().positive(), ...renderedShape });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateSpeciesSchema = ResponseSpeciesGmSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, and no grants of features the player may not see.
 */
export const ResponseSpeciesPlayerSchema = SpeciesBaseSchema.pick({
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
    featureGrants: z.array(SpeciesFeatureGrantViewSchema),
    ...renderedShape,
  });

export const ResponseSpeciesSchema = z.discriminatedUnion("view", [
  ResponseSpeciesGmSchema,
  ResponseSpeciesPlayerSchema,
]);

const listSummaryShape = {
  sizes: z.array(z.enum(SPECIES_SIZES)),
  /** The base walking speed in feet. */
  speed: z.number().int().nullable(),
};

/** List entry for GMs and editors: everything to sort and pick a species, but no definition. */
export const ResponseSpeciesListItemGmSchema = ResponseSpeciesGmSchema.pick({
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
  creatureType: true,
  displayOrder: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseSpeciesListItemPlayerSchema = ResponseSpeciesPlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  creatureType: true,
  displayOrder: true,
  selectable: true,
}).extend(listSummaryShape);

export const ResponseSpeciesListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseSpeciesListItemGmSchema, ResponseSpeciesListItemPlayerSchema]),
);

export const ResponseValidationSchema = z.strictObject({
  id: uuidDto,
  valid: z.boolean(),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail and the selection
// ---------------------------------------------------------------------------

const sectionHeader = { speciesId: uuidDto, assetId: uuidDto, view: viewDto };

const sourceShape = {
  sourceType: z.enum(["SPECIES", "SPECIES_VARIANT"]),
  sourceAssetId: uuidDto,
};

/** Grants of the species and of every variant the viewer may see. */
export const ResponseSpeciesFeaturesSchema = z.strictObject({
  ...sectionHeader,
  grants: z.array(z.strictObject({ ...SpeciesFeatureGrantViewSchema.shape, ...sourceShape })),
});

const offeredVariantDto = z.strictObject({
  variantId: uuidDto,
  assetId: uuidDto,
  code: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  displayOrder: z.number().int(),
  selectable: selectableDto,
});

/** What a character picks from when choosing the species. */
export const ResponseSpeciesCreationOptionsSchema = z.strictObject({
  ...sectionHeader,
  selectable: selectableDto,
  creatureType: SpeciesBaseSchema.shape.creatureType,
  lifespanMode: SpeciesBaseSchema.shape.lifespanMode,
  ageProfile: SpeciesBaseSchema.shape.ageProfile,
  physicalProfile: SpeciesBaseSchema.shape.physicalProfile,
  sizeOptions: z.array(SizeOptionSchema),
  defaultSize: z.enum(SPECIES_SIZES).nullable(),
  movementModes: z.array(MovementModeSchema),
  variantGroups: z.array(
    z.strictObject({
      ...VariantGroupSchema.shape,
      satisfiable: z.boolean(),
      variants: z.array(offeredVariantDto),
    }),
  ),
});

/** A checked selection with the grants that apply at the character level, resolved. */
export const ResponseSpeciesSelectionSchema = z.strictObject({
  ...sectionHeader,
  characterLevel: z.number().int(),
  size: z.enum(SPECIES_SIZES),
  creatureType: SpeciesBaseSchema.shape.creatureType,
  movementModes: z.array(MovementModeSchema),
  variants: z.array(
    z.strictObject({
      variantId: uuidDto,
      assetId: uuidDto,
      code: z.string(),
      name: z.string(),
      variantGroupCode: z.string(),
    }),
  ),
  grants: z.array(
    z.strictObject({
      ...sourceShape,
      key: z.string(),
      minimumCharacterLevel: z.number().int(),
      featureAssetId: uuidDto,
      operation: z.enum(GRANT_OPERATIONS),
      targetFeatureAssetId: uuidDto.nullable(),
      /** See `GrantStatus`; `DUPLICATE` when the feature's stacking mode drops a repeated grant. */
      status: z.enum(["APPLIED", "UPGRADED", "REPLACED", "LOCKED", "DUPLICATE"]),
      resolved: ResponseResolvedFeatureSchema.nullable(),
    }),
  ),
  /** Passive effects of applied grants, added up; e.g. ability score increases of 2014 races. */
  totals: z.strictObject({
    modifiers: z.record(z.string(), z.number()),
    baseValues: z.record(z.string(), z.number()),
    grants: z.array(z.strictObject({ grantType: z.string(), value: z.string() })),
    advantages: z.array(
      z.strictObject({ mode: z.enum(["ADVANTAGE", "DISADVANTAGE"]), on: z.string() }),
    ),
  }),
});

export type ResponseSpeciesGmDto = z.infer<typeof ResponseSpeciesGmSchema>;
export type ResponseUpdateSpeciesDto = z.infer<typeof ResponseUpdateSpeciesSchema>;
export type ResponseSpeciesPlayerDto = z.infer<typeof ResponseSpeciesPlayerSchema>;
export type ResponseSpeciesDto = z.infer<typeof ResponseSpeciesSchema>;
export type ResponseSpeciesListDto = z.infer<typeof ResponseSpeciesListSchema>;
export type ResponseSpeciesListItemGmDto = z.infer<typeof ResponseSpeciesListItemGmSchema>;
export type ResponseSpeciesListItemPlayerDto = z.infer<typeof ResponseSpeciesListItemPlayerSchema>;
export type ResponseValidationDto = z.infer<typeof ResponseValidationSchema>;
export type ResponseSpeciesFeaturesDto = z.infer<typeof ResponseSpeciesFeaturesSchema>;
export type ResponseSpeciesCreationOptionsDto = z.infer<typeof ResponseSpeciesCreationOptionsSchema>;
export type ResponseSpeciesSelectionDto = z.infer<typeof ResponseSpeciesSelectionSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coreOf(row: SpeciesRow, definition: SpeciesDefinition) {
  return {
    code: row.code,
    description: row.description,
    descriptionHtml: renderDescription(row.description),
    creatureType: row.creatureType,
    lifespanMode: row.lifespanMode,
    displayOrder: row.displayOrder,
    textSectionsHtml: definition.textSections.map((section) => ({
      key: section.key,
      contentHtml: renderSafeMarkdown("MARKDOWN", section.content),
    })),
  };
}

/** Sizes and base speed for lists, read without parsing the whole definition. */
function listSummaryOf(row: SpeciesRow) {
  const sizes = Array.isArray(row.sizeOptions)
    ? (row.sizeOptions as { size?: unknown }[])
        .map((option) => option.size)
        .filter((size): size is (typeof SPECIES_SIZES)[number] =>
          (SPECIES_SIZES as readonly unknown[]).includes(size),
        )
    : [];
  const base = Array.isArray(row.movementModes)
    ? (row.movementModes as { isBase?: unknown; distanceFeet?: unknown }[]).find((mode) => mode.isBase)
    : undefined;

  return { sizes, speed: typeof base?.distanceFeet === "number" ? base.distanceFeet : null };
}

export function toSpeciesGmResponse({ species: row, asset, rulesetIds }: SpeciesRecord): ResponseSpeciesGmDto {
  const definition = readSpeciesDefinition(row);

  return {
    view: "GM",
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
    ...coreOf(row, definition),
    ...definition,
  };
}

export function toSpeciesPlayerResponse(
  { species: row, asset }: SpeciesWithAsset,
  isVisible: (assetId: string) => boolean,
): ResponseSpeciesPlayerDto {
  const definition = readSpeciesDefinition(row);

  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(row, definition),
    ...definition,
    featureGrants: toPlayerGrants(definition.featureGrants, isVisible),
  };
}

export function toSpeciesListItemGmResponse({
  species: row,
  asset,
  rulesetIds,
}: SpeciesRecord): ResponseSpeciesListItemGmDto {
  return {
    view: "GM",
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
    creatureType: row.creatureType,
    displayOrder: row.displayOrder,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toSpeciesListItemPlayerResponse({
  species: row,
  asset,
}: SpeciesWithAsset): ResponseSpeciesListItemPlayerDto {
  return {
    view: "PLAYER",
    id: row.id,
    assetId: row.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: row.code,
    creatureType: row.creatureType,
    displayOrder: row.displayOrder,
    selectable: asset.status === "ACTIVE",
    ...listSummaryOf(row),
  };
}

export function toSpeciesListResponse(params: {
  page: SpeciesPage;
  data: ResponseSpeciesListDto["data"];
  limit: number;
}): ResponseSpeciesListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.species.code, id: last.species.id })
        : null,
  });
}
