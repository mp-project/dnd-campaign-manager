import { z } from "zod";

import { UUID_PATTERN } from "#core/uuid";
import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import { ClassBaseSchema } from "#src/modules/classes/domain/dto/BaseClassDto";
import {
  ClassChoiceViewSchema,
  type ClassDefinition,
  FeatureGrantSchema,
  MulticlassRulesSchema,
  PrimaryAbilitiesSchema,
  ProficiencyRuleViewSchema,
  ProgressionTrackSchema,
  SpellcastingProfileSchema,
  StartingEquipmentOptionViewSchema,
} from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import {
  getChoiceDefinitions,
  getFeatureGrants,
  getMulticlassRequirements,
  getProficiencyGrants,
  getProgression,
  getSpellcastingProfile,
  getStartingEquipment,
} from "#src/modules/classes/domain/ClassViews";
import type {
  ClassPage,
  ClassRecord,
  ClassRow,
  ClassWithAsset,
} from "#src/modules/classes/domain/repository/ClassesRepository";
import { parseClassDefinition } from "#src/modules/classes/history/TrackedClass";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string();

/**
 * Whether the class may be chosen anew: only active ones. Archived classes appear while the
 * campaign still uses them, but cannot be chosen anymore.
 */
const selectableDto = z.boolean();

const coreShape = ClassBaseSchema.pick({
  code: true,
  description: true,
  maximumLevel: true,
  hitDie: true,
  firstLevelHitPoints: true,
  fixedHitPointsPerLevel: true,
  subclassSelectionLevel: true,
  displayOrder: true,
}).shape;

/** Definition parts as stored for those who may change them. */
const definitionShape = ClassBaseSchema.pick({
  primaryAbilities: true,
  proficiencies: true,
  startingEquipment: true,
  progressionTracks: true,
  levels: true,
  choices: true,
  spellcasting: true,
  multiclass: true,
}).shape;

/**
 * Definition parts for players: references to assets they may not see are left out (grants,
 * proficiency and choice options, choices of left-out grants) or emptied (items, spell list), so
 * the parts may break rules that only apply to stored definitions.
 */
const playerDefinitionShape = {
  ...definitionShape,
  proficiencies: z.array(ProficiencyRuleViewSchema),
  startingEquipment: z.array(StartingEquipmentOptionViewSchema),
  choices: z.array(ClassChoiceViewSchema),
};

/**
 * View for those who may change the class, and for GMs reading global classes. `version` and the
 * audit fields belong to the class, `assetVersion` to its asset; changes send both back.
 */
export const ResponseClassGmSchema = baseEntityResponseDto
  .extend(
    ClassBaseSchema.pick({
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
    view: z.literal("GM"),
    assetVersion: z.number().int().positive(),
    descriptionHtml: htmlDto.nullable(),
    selectable: selectableDto,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateClassSchema = ResponseClassGmSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players. Strict, so nothing else can leave the server: no audit data, rulesets or
 * release flag, and no references to assets the player may not see.
 */
export const ResponseClassPlayerSchema = ClassBaseSchema.pick({
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

export const ResponseClassSchema = z.discriminatedUnion("view", [
  ResponseClassGmSchema,
  ResponseClassPlayerSchema,
]);

const castingTypeDto = SpellcastingProfileSchema.shape.castingType;

/** List entry for GMs and editors: everything to sort and pick a class, but no definition. */
export const ResponseClassListItemGmSchema = ResponseClassGmSchema.pick({
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
  hitDie: true,
  displayOrder: true,
  primaryAbilities: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  selectable: true,
}).extend({ spellcastingType: castingTypeDto });

export const ResponseClassListItemPlayerSchema = ResponseClassPlayerSchema.pick({
  id: true,
  view: true,
  assetId: true,
  scope: true,
  name: true,
  summary: true,
  code: true,
  hitDie: true,
  displayOrder: true,
  primaryAbilities: true,
  selectable: true,
}).extend({ spellcastingType: castingTypeDto });

export const ResponseClassListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseClassListItemGmSchema, ResponseClassListItemPlayerSchema]),
);

export const ResponseClassValidationSchema = z.strictObject({
  classId: uuidDto,
  valid: z.boolean(),
  issues: z.array(
    z.strictObject({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Sections of the catalog detail
// ---------------------------------------------------------------------------

const sectionHeader = {
  classId: uuidDto,
  assetId: uuidDto,
  view: z.enum(["GM", "PLAYER"]),
};


export const CLASS_SECTIONS = [
  "progression",
  "features",
  "choices",
  "spellcasting",
  "proficiencies",
  "starting-equipment",
  "multiclass",
] as const;

export type ClassSection = (typeof CLASS_SECTIONS)[number];

export const ResponseClassSectionSchemas = {
  progression: z.strictObject({
    ...sectionHeader,
    maximumLevel: ClassBaseSchema.shape.maximumLevel,
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
      }),
    ),
  }),
  features: z.strictObject({
    ...sectionHeader,
    grants: z.array(z.strictObject({ ...FeatureGrantSchema.shape, level: z.number().int() })),
  }),
  choices: z.strictObject({
    ...sectionHeader,
    subclassSelectionLevel: ClassBaseSchema.shape.subclassSelectionLevel,
    choices: z.array(ClassChoiceViewSchema),
  }),
  spellcasting: z.strictObject({
    ...sectionHeader,
    spellcasting: SpellcastingProfileSchema.nullable(),
  }),
  proficiencies: z.strictObject({
    ...sectionHeader,
    startingClass: z.array(ProficiencyRuleViewSchema),
    multiclass: z.array(ProficiencyRuleViewSchema),
  }),
  "starting-equipment": z.strictObject({
    ...sectionHeader,
    options: z.array(StartingEquipmentOptionViewSchema),
  }),
  multiclass: z.strictObject({
    ...sectionHeader,
    combinationMode: MulticlassRulesSchema.shape.combinationMode,
    abilityRequirements: MulticlassRulesSchema.shape.abilityRequirements,
    proficiencies: z.array(ProficiencyRuleViewSchema),
  }),
} satisfies Record<ClassSection, z.ZodType>;

export type ResponseClassSectionDto = z.infer<
  (typeof ResponseClassSectionSchemas)[ClassSection]
>;

export type ResponseClassGmDto = z.infer<typeof ResponseClassGmSchema>;
export type ResponseUpdateClassDto = z.infer<typeof ResponseUpdateClassSchema>;
export type ResponseClassPlayerDto = z.infer<typeof ResponseClassPlayerSchema>;
export type ResponseClassDto = z.infer<typeof ResponseClassSchema>;
export type ResponseClassListDto = z.infer<typeof ResponseClassListSchema>;
export type ResponseClassListItemGmDto = z.infer<typeof ResponseClassListItemGmSchema>;
export type ResponseClassListItemPlayerDto = z.infer<typeof ResponseClassListItemPlayerSchema>;
export type ResponseClassValidationDto = z.infer<typeof ResponseClassValidationSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const renderDescription = (description: string | null) =>
  description === null ? null : renderSafeMarkdown("MARKDOWN", description);

const castingTypeOf = (row: Pick<ClassRow, "spellcasting">) =>
  ((row.spellcasting as { castingType?: string } | null)?.castingType ?? "NONE") as z.infer<
    typeof castingTypeDto
  >;

function coreOf(row: ClassRow) {
  return {
    code: row.code,
    description: row.description,
    descriptionHtml: renderDescription(row.description),
    maximumLevel: row.maximumLevel,
    hitDie: row.hitDie,
    firstLevelHitPoints: row.firstLevelHitPoints,
    fixedHitPointsPerLevel: row.fixedHitPointsPerLevel,
    subclassSelectionLevel: row.subclassSelectionLevel,
    displayOrder: row.displayOrder,
  };
}

/**
 * The definition as a player may see it. `isVisible` tells whether the player may see a referenced
 * asset. Grants of hidden features and hidden proficiency and choice options are left out, and so
 * is everything that depends on a left-out part: choices asked by a left-out grant, grants that
 * only a left-out choice selects, bindings to a left-out choice. Hidden items and spell lists are
 * emptied, bound values pointing to hidden assets are dropped.
 */
export function toPlayerDefinition(
  definition: ClassDefinition,
  isVisible: (assetId: string) => boolean,
) {
  const hidden = (assetId: string | null) => assetId !== null && !isVisible(assetId);
  const removedGrants = new Set<string>();
  const removedChoices = new Set<string>();
  const grants = definition.levels.flatMap((entry) => entry.featureGrants);

  for (const grant of grants) {
    if (hidden(grant.featureAssetId) || hidden(grant.targetFeatureAssetId)) {
      removedGrants.add(grant.key);
    }
  }

  // A left-out grant takes its choices along, a left-out choice the grants it selects.
  for (let changed = true; changed; ) {
    changed = false;

    for (const choice of definition.choices) {
      if (choice.grantKey !== null && removedGrants.has(choice.grantKey) && !removedChoices.has(choice.key)) {
        removedChoices.add(choice.key);
        changed = true;
      }
    }

    for (const grant of grants) {
      if (grant.choiceKey !== null && removedChoices.has(grant.choiceKey) && !removedGrants.has(grant.key)) {
        removedGrants.add(grant.key);
        changed = true;
      }
    }
  }

  return {
    ...definition,
    proficiencies: definition.proficiencies.map((rule) => ({
      ...rule,
      options: rule.options.filter((option) => !hidden(option.assetId)),
    })),
    startingEquipment: definition.startingEquipment.map((option) => ({
      ...option,
      entries: option.entries.map((entry) =>
        hidden(entry.itemAssetId) ? { ...entry, itemAssetId: null } : entry,
      ),
    })),
    levels: definition.levels.map((entry) => ({
      ...entry,
      featureGrants: entry.featureGrants
        .filter((grant) => !removedGrants.has(grant.key))
        .map((grant) => ({
          ...grant,
          bindings: grant.bindings.filter(
            (binding) =>
              !(
                binding.bindingSource === "STATIC" &&
                typeof binding.staticValue === "string" &&
                UUID_PATTERN.test(binding.staticValue) &&
                hidden(binding.staticValue)
              ) &&
              !(binding.bindingSource === "CLASS_CHOICE" && removedChoices.has(binding.choiceKey ?? "")),
          ),
        })),
    })),
    choices: definition.choices
      .filter((choice) => !removedChoices.has(choice.key))
      .map((choice) => ({
        ...choice,
        options: choice.options.filter((option) => !hidden(option.linkedAssetId)),
      })),
    spellcasting:
      definition.spellcasting && hidden(definition.spellcasting.spellListAssetId)
        ? { ...definition.spellcasting, spellListAssetId: null }
        : definition.spellcasting,
  };
}

export function toClassGmResponse({ characterClass, asset, rulesetIds }: ClassRecord): ResponseClassGmDto {
  return {
    view: "GM",
    id: characterClass.id,
    version: characterClass.version,
    createdAt: characterClass.createdAt.toISOString(),
    updatedAt: characterClass.updatedAt.toISOString(),
    deletedAt: characterClass.deletedAt?.toISOString() ?? null,
    createdBy: characterClass.createdBy,
    updatedBy: characterClass.updatedBy,
    assetId: characterClass.assetId,
    assetVersion: asset.version,
    campaignId: characterClass.campaignId,
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
    ...coreOf(characterClass),
    ...parseClassDefinition(characterClass),
  };
}

export function toClassPlayerResponse(
  { characterClass, asset }: ClassWithAsset,
  isVisible: (assetId: string) => boolean,
): ResponseClassPlayerDto {
  return {
    view: "PLAYER",
    id: characterClass.id,
    assetId: characterClass.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    selectable: asset.status === "ACTIVE",
    ...coreOf(characterClass),
    ...toPlayerDefinition(parseClassDefinition(characterClass), isVisible),
  };
}

export function toClassListItemGmResponse({
  characterClass,
  asset,
  rulesetIds,
}: ClassRecord): ResponseClassListItemGmDto {
  return {
    view: "GM",
    id: characterClass.id,
    version: characterClass.version,
    createdAt: characterClass.createdAt.toISOString(),
    updatedAt: characterClass.updatedAt.toISOString(),
    deletedAt: characterClass.deletedAt?.toISOString() ?? null,
    createdBy: characterClass.createdBy,
    updatedBy: characterClass.updatedBy,
    assetId: characterClass.assetId,
    assetVersion: asset.version,
    campaignId: characterClass.campaignId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    code: characterClass.code,
    hitDie: characterClass.hitDie,
    displayOrder: characterClass.displayOrder,
    primaryAbilities: PrimaryAbilitiesSchema.parse(characterClass.primaryAbilities),
    spellcastingType: castingTypeOf(characterClass),
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds: [...rulesetIds].sort(),
    assetFamilyId: asset.assetFamilyId,
    releasedToPlayers: asset.releasedToPlayers,
    selectable: asset.status === "ACTIVE",
  };
}

export function toClassListItemPlayerResponse({
  characterClass,
  asset,
}: ClassWithAsset): ResponseClassListItemPlayerDto {
  return {
    view: "PLAYER",
    id: characterClass.id,
    assetId: characterClass.assetId,
    scope: asset.scope,
    name: asset.title,
    summary: asset.summary,
    code: characterClass.code,
    hitDie: characterClass.hitDie,
    displayOrder: characterClass.displayOrder,
    primaryAbilities: PrimaryAbilitiesSchema.parse(characterClass.primaryAbilities),
    spellcastingType: castingTypeOf(characterClass),
    selectable: asset.status === "ACTIVE",
  };
}

export function toClassListResponse(params: {
  page: ClassPage;
  data: ResponseClassListDto["data"];
  limit: number;
}): ResponseClassListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({
            sortValue: last.characterClass.code,
            id: last.characterClass.id,
          })
        : null,
  });
}

/** One section of the catalog detail, from a definition already stripped for players. */
export function toClassSectionResponse(
  section: ClassSection,
  found: ClassWithAsset,
  view: "GM" | "PLAYER",
  definition: ReturnType<typeof toPlayerDefinition>,
): ResponseClassSectionDto {
  const header = { classId: found.characterClass.id, assetId: found.asset.id, view };
  const row = found.characterClass;
  const stored = definition as ClassDefinition;

  switch (section) {
    case "progression":
      return { ...header, ...getProgression(row, stored) };
    case "features":
      return { ...header, grants: getFeatureGrants(stored) };
    case "choices":
      return { ...header, ...getChoiceDefinitions(row, stored) };
    case "spellcasting":
      return { ...header, ...getSpellcastingProfile(stored) };
    case "proficiencies":
      return { ...header, ...getProficiencyGrants(stored) };
    case "starting-equipment":
      return { ...header, ...getStartingEquipment(stored) };
    case "multiclass":
      return { ...header, ...getMulticlassRequirements(stored) };
  }
}
