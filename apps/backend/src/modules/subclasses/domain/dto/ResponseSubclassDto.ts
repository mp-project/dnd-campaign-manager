import { z } from "zod";

import type { ContentView } from "#core/content/viewer";
import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import {
  ClassChoiceViewSchema,
  FeatureGrantSchema,
  ProgressionTrackSchema,
} from "#src/modules/classes/index";
import { SubclassBaseSchema } from "#src/modules/subclasses/domain/dto/BaseSubclassDto";
import {
  SpellGrantSchema,
  type SubclassDefinition,
  SubclassSpellcastingSchema,
} from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import {
  getChoices,
  getFeatureGrants,
  getProgression,
  getSpellcasting,
} from "#src/modules/subclasses/domain/SubclassViews";
import type {
  SubclassPage,
  SubclassRecord,
  SubclassRow,
  SubclassWithAsset,
} from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import { parseSubclassDefinition } from "#src/modules/subclasses/history/TrackedSubclass";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the subclass may be chosen anew: only active ones. Archived subclasses appear while the
 * campaign still uses them, but cannot be chosen anymore.
 */
const selectableDto = z.boolean();

const coreShape = SubclassBaseSchema.pick({
  classId: true,
  classAssetId: true,
  code: true,
  description: true,
  displayOrder: true,
  selectionLevel: true,
}).shape;

/** Definition parts as stored for those who may change them. */
const definitionShape = SubclassBaseSchema.pick({
  levels: true,
  progressionTracks: true,
  choices: true,
  spellcasting: true,
  spellGrants: true,
}).shape;

/**
 * Definition parts for players: references to assets they may not see are left out (grants, choice
 * options, choices of left-out grants, granted spells) or emptied (spell list), so the parts may
 * break rules that only apply to stored definitions.
 */
const playerDefinitionShape = {
  ...definitionShape,
  choices: z.array(ClassChoiceViewSchema),
};

/**
 * View for those who may change the subclass, and for GMs reading global subclasses. `version`
 * and the audit fields belong to the subclass, `assetVersion` to its asset; changes send both.
 */
export const ResponseSubclassFullSchema = baseEntityResponseDto
  .extend(
    SubclassBaseSchema.pick({
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
    descriptionHtml: htmlDto.nullable(),
    selectable: selectableDto,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateSubclassSchema = ResponseSubclassFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, and no references to assets the player may not see.
 */
export const ResponseSubclassPlayerSchema = SubclassBaseSchema.pick({
  id: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
})
  .extend(coreShape)
  .extend(playerDefinitionShape)
  .extend({
    view: z.literal("PLAYER"),
    descriptionHtml: htmlDto.nullable(),
    selectable: selectableDto,
  });

export const ResponseSubclassSchema = z.discriminatedUnion("view", [
  ResponseSubclassFullSchema,
  ResponseSubclassPlayerSchema,
]);

/** List entry for GMs and editors: everything to sort and pick a subclass, but no definition. */
export const ResponseSubclassListItemFullSchema = ResponseSubclassFullSchema.pick({
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
  classId: true,
  classAssetId: true,
  code: true,
  displayOrder: true,
  selectionLevel: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  selectable: true,
});

export const ResponseSubclassListItemPlayerSchema = ResponseSubclassPlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  classId: true,
  classAssetId: true,
  code: true,
  displayOrder: true,
  selectionLevel: true,
  selectable: true,
});

const listItemDto = z.discriminatedUnion("view", [
  ResponseSubclassListItemFullSchema,
  ResponseSubclassListItemPlayerSchema,
]);

export const ResponseSubclassListSchema = standardListResponseDto(listItemDto);

/** The subclasses of one class in the catalog; few per class, so not paged. */
export const ResponseClassSubclassesSchema = z.strictObject({
  classId: uuidDto,
  classAssetId: uuidDto,
  selectionLevel: SubclassBaseSchema.shape.selectionLevel,
  data: z.array(listItemDto),
});

export const ResponseSubclassValidationSchema = z.strictObject({
  subclassId: uuidDto,
  valid: z.boolean(),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

/**
 * Whether a class assignment may take the subclass. `grantKeys` are the subclass's grants the
 * character has at the class level once it takes it (for players without hidden ones).
 */
export const ResponseSubclassSelectionCheckSchema = z.strictObject({
  subclassId: uuidDto,
  classId: uuidDto,
  selectionLevel: SubclassBaseSchema.shape.selectionLevel,
  valid: z.boolean(),
  issues: z.array(z.strictObject({ code: z.string(), message: z.string() })),
  grantKeys: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail
// ---------------------------------------------------------------------------

const sectionHeader = {
  subclassId: uuidDto,
  assetId: uuidDto,
  classId: uuidDto,
  view: z.enum(["FULL", "PLAYER"]),
};

export const SUBCLASS_SECTIONS = ["progression", "features", "choices", "spellcasting"] as const;

export type SubclassSection = (typeof SUBCLASS_SECTIONS)[number];

export const ResponseSubclassSectionSchemas = {
  progression: z.strictObject({
    ...sectionHeader,
    selectionLevel: SubclassBaseSchema.shape.selectionLevel,
    maximumLevel: z.number().int(),
    tracks: z.array(
      z.strictObject({
        key: ProgressionTrackSchema.shape.key,
        label: ProgressionTrackSchema.shape.label,
        valueType: ProgressionTrackSchema.shape.valueType,
        unit: ProgressionTrackSchema.shape.unit,
        displayOrder: ProgressionTrackSchema.shape.displayOrder,
      }),
    ),
    levels: z.array(
      z.strictObject({
        level: z.number().int(),
        values: z.array(z.strictObject({ trackKey: z.string(), value: z.json().nullable() })),
        featureGrantKeys: z.array(z.string()),
        choiceKeys: z.array(z.string()),
        spellGrantKeys: z.array(z.string()),
      }),
    ),
  }),
  features: z.strictObject({
    ...sectionHeader,
    grants: z.array(z.strictObject({ ...FeatureGrantSchema.shape, level: z.number().int() })),
  }),
  choices: z.strictObject({
    ...sectionHeader,
    selectionLevel: SubclassBaseSchema.shape.selectionLevel,
    choices: z.array(ClassChoiceViewSchema),
  }),
  spellcasting: z.strictObject({
    ...sectionHeader,
    spellcasting: SubclassSpellcastingSchema.nullable(),
    spellGrants: z.array(SpellGrantSchema),
  }),
} satisfies Record<SubclassSection, z.ZodType>;

export type ResponseSubclassSectionDto = z.infer<
  (typeof ResponseSubclassSectionSchemas)[SubclassSection]
>;

export type ResponseSubclassFullDto = z.infer<typeof ResponseSubclassFullSchema>;
export type ResponseUpdateSubclassDto = z.infer<typeof ResponseUpdateSubclassSchema>;
export type ResponseSubclassPlayerDto = z.infer<typeof ResponseSubclassPlayerSchema>;
export type ResponseSubclassDto = z.infer<typeof ResponseSubclassSchema>;
export type ResponseSubclassListDto = z.infer<typeof ResponseSubclassListSchema>;
export type ResponseSubclassListItemDto = z.infer<typeof listItemDto>;
export type ResponseSubclassListItemFullDto = z.infer<typeof ResponseSubclassListItemFullSchema>;
export type ResponseSubclassListItemPlayerDto = z.infer<typeof ResponseSubclassListItemPlayerSchema>;
export type ResponseClassSubclassesDto = z.infer<typeof ResponseClassSubclassesSchema>;
export type ResponseSubclassValidationDto = z.infer<typeof ResponseSubclassValidationSchema>;
export type ResponseSubclassSelectionCheckDto = z.infer<typeof ResponseSubclassSelectionCheckSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coreOf({ subclass, base }: SubclassWithAsset) {
  return {
    classId: subclass.classId,
    classAssetId: base.classAssetId,
    code: subclass.code,
    description: subclass.description,
    descriptionHtml: renderDescription(subclass.description),
    displayOrder: subclass.displayOrder,
    selectionLevel: base.selectionLevel,
  };
}

const renderDescription = (description: SubclassRow["description"]) =>
  description === null ? null : renderSafeMarkdown("MARKDOWN", description);

function auditOf(subclass: SubclassRow) {
  return {
    id: subclass.id,
    version: subclass.version,
    createdAt: subclass.createdAt.toISOString(),
    updatedAt: subclass.updatedAt.toISOString(),
    deletedAt: subclass.deletedAt?.toISOString() ?? null,
    createdBy: subclass.createdBy,
    updatedBy: subclass.updatedBy,
  };
}

export function toSubclassFullResponse(record: SubclassRecord): ResponseSubclassFullDto {
  const { subclass, asset, rulesetIds } = record;

  return {
    view: "FULL",
    ...auditOf(subclass),
    assetId: subclass.assetId,
    assetVersion: asset.version,
    campaignId: subclass.campaignId,
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
    ...coreOf(record),
    ...parseSubclassDefinition(subclass),
  };
}

/** `definition` is already stripped for the player (`toPlayerSubclassDefinition`). */
export function toSubclassPlayerResponse(
  found: SubclassWithAsset,
  definition: SubclassDefinition,
): ResponseSubclassPlayerDto {
  return {
    view: "PLAYER",
    id: found.subclass.id,
    assetId: found.subclass.assetId,
    scope: found.asset.scope,
    name: found.asset.title,
    summary: found.asset.summary,
    selectable: found.asset.status === "ACTIVE",
    ...coreOf(found),
    ...definition,
  };
}

export function toSubclassListItemFullResponse(record: SubclassRecord): ResponseSubclassListItemFullDto {
  const { subclass, asset, base, rulesetIds } = record;

  return {
    view: "FULL",
    ...auditOf(subclass),
    assetId: subclass.assetId,
    assetVersion: asset.version,
    campaignId: subclass.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    classId: subclass.classId,
    classAssetId: base.classAssetId,
    code: subclass.code,
    displayOrder: subclass.displayOrder,
    selectionLevel: base.selectionLevel,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
  };
}

export function toSubclassListItemPlayerResponse({
  subclass,
  asset,
  base,
}: SubclassWithAsset): ResponseSubclassListItemPlayerDto {
  return {
    view: "PLAYER",
    id: subclass.id,
    assetId: subclass.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    classId: subclass.classId,
    classAssetId: base.classAssetId,
    code: subclass.code,
    displayOrder: subclass.displayOrder,
    selectionLevel: base.selectionLevel,
    selectable: asset.status === "ACTIVE",
  };
}

export function toSubclassListResponse(params: {
  page: SubclassPage;
  data: ResponseSubclassListDto["data"];
  limit: number;
}): ResponseSubclassListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.subclass.code, id: last.subclass.id })
        : null,
  });
}

/** One section of the catalog detail, from a definition already stripped for players. */
export function toSubclassSectionResponse(
  section: SubclassSection,
  found: SubclassWithAsset,
  view: ContentView,
  definition: SubclassDefinition,
): ResponseSubclassSectionDto {
  const header = {
    subclassId: found.subclass.id,
    assetId: found.asset.id,
    classId: found.subclass.classId,
    view,
  };

  switch (section) {
    case "progression":
      return { ...header, ...getProgression(found.base, definition) };
    case "features":
      return { ...header, grants: getFeatureGrants(definition) };
    case "choices":
      return { ...header, ...getChoices(found.base, definition) };
    case "spellcasting":
      return { ...header, ...getSpellcasting(definition) };
  }
}
