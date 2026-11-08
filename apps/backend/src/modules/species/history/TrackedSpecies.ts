import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { HistoryAccess } from "#core/history/types";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import {
  SpeciesBaseSchema,
  SpeciesVariantBaseSchema,
} from "#src/modules/species/domain/dto/BaseSpeciesDto";
import {
  type SpeciesDefinition,
  SpeciesDefinitionSchema,
  type SpeciesFeatureGrant,
  SpeciesFeatureGrantsSchema,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import {
  validateGrantKeys,
  validateSpeciesDefinition,
} from "#src/modules/species/domain/SpeciesDefinition";
import { species, speciesVariants } from "#src/modules/species/domain/entities/SpeciesTable";
import type {
  SpeciesRow,
  SpeciesVariantRow,
} from "#src/modules/species/domain/repository/SpeciesRepository";

export const SPECIES_ENTITY_TYPE = "species";

/**
 * The parts of a species definition and the lifespan mode they are checked against. They refer to
 * each other (grants and variant groups, lifespans and mode), so a change to one of them is a
 * conflict with a change to any other; a mix of two versions could mean something nobody wrote.
 */
export const SPECIES_DEFINITION_GROUP = [
  "lifespanMode",
  "sizeOptions",
  "movementModes",
  "ageProfile",
  "physicalProfile",
  "textSections",
  "variantGroups",
  "featureGrants",
] as const;
export const SPECIES_VARIANT_ENTITY_TYPE = "speciesVariant";

export const SPECIES_ACTIONS = {
  create: "species.create",
  update: "species.update",
  delete: "species.delete",
  restore: "species.restore",
  createVariant: "species.variant.create",
  updateVariant: "species.variant.update",
  deleteVariant: "species.variant.delete",
  restoreVariant: "species.variant.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const SPECIES_ASSET_ACTIONS: readonly string[] = [
  SPECIES_ACTIONS.update,
  SPECIES_ACTIONS.delete,
  SPECIES_ACTIONS.restore,
  SPECIES_ACTIONS.updateVariant,
  SPECIES_ACTIONS.deleteVariant,
  SPECIES_ACTIONS.restoreVariant,
];

type ParsableSpeciesRow = Pick<
  SpeciesRow,
  | "lifespanMode"
  | "sizeOptions"
  | "movementModes"
  | "ageProfile"
  | "physicalProfile"
  | "textSections"
  | "variantGroups"
  | "featureGrants"
>;

type TrackedSpeciesDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  /**
   * Checks referenced features, the 2024 ability rule, the code and the groups variants use, and
   * that the asset may still change. Runs for every change, so undoing and restoring cannot bring
   * back an unavailable target.
   */
  assertSpeciesConsistent(
    row: SpeciesRow & { definition: SpeciesDefinition },
    db: AppDatabase,
  ): Promise<void>;
  /** The same for variants, against their species. */
  assertVariantConsistent(
    row: SpeciesVariantRow & { featureGrants: SpeciesFeatureGrant[] },
    db: AppDatabase,
  ): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseSpeciesDefinition(row: ParsableSpeciesRow): SpeciesDefinition {
  const parsed = SpeciesDefinitionSchema.safeParse({
    sizeOptions: row.sizeOptions,
    movementModes: row.movementModes,
    ageProfile: row.ageProfile,
    physicalProfile: row.physicalProfile,
    textSections: row.textSections,
    variantGroups: row.variantGroups,
    featureGrants: row.featureGrants,
  });

  if (!parsed.success) {
    throw new ValidationError("Species definition is invalid", parsed.error.issues);
  }

  const issues = validateSpeciesDefinition(row, parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Species definition is invalid", issues);
  }

  return parsed.data;
}

/** Parses the grants of a variant; the rules against its species need the database. */
export function parseVariantGrants(row: Pick<SpeciesVariantRow, "featureGrants">): SpeciesFeatureGrant[] {
  const parsed = SpeciesFeatureGrantsSchema.safeParse(row.featureGrants);

  if (!parsed.success) {
    throw new ValidationError("Variant definition is invalid", parsed.error.issues);
  }

  const issues = validateGrantKeys(parsed.data, ["featureGrants"]);

  if (issues.length > 0) {
    throw new ValidationError("Variant definition is invalid", issues);
  }

  return parsed.data;
}

/**
 * The definition for a read. A stored definition that no longer parses (for example after a schema
 * change) is no fault of the request, so reads answer 409 and point to `validate` instead of 400.
 */
export function readSpeciesDefinition(row: ParsableSpeciesRow): SpeciesDefinition {
  try {
    return parseSpeciesDefinition(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored species definition is invalid; see validate", {
        speciesId: (row as { id?: string }).id,
      });
    }

    throw error;
  }
}

/**
 * The grants of a variant for a read, or null when the stored grants no longer parse. Reads leave
 * such a variant out, so one broken variant cannot break its species; `validate` reports it.
 */
export function tryParseVariantGrants(
  row: Pick<SpeciesVariantRow, "featureGrants">,
): SpeciesFeatureGrant[] | null {
  try {
    return parseVariantGrants(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      return null;
    }

    throw error;
  }
}

/**
 * Custom content: GMs and editors may change it, so only they read the history. Global content is
 * changed by administrators only, who pass every check anyway.
 */
function customOnlyAccess<Row extends { campaignId: string | null }>(
  deps: Pick<TrackedSpeciesDeps, "resolveRole">,
): HistoryAccess<Row> {
  const campaignAccess = campaignHistoryAccess<Row>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return {
    read: async (context, row, db) => row.campaignId !== null && campaignAccess.read(context, row, db),
    readField: async (context, row, name, db) =>
      row.campaignId !== null &&
      ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
    revert: async (context, row, change, db) =>
      row.campaignId !== null && ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
    restore: async (context, row, db) =>
      row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
  };
}

/**
 * History rules of species. In the history of the asset the species appears as a child; name,
 * summary, status and rulesets are fields of the asset and follow its rights.
 */
export function createTrackedSpecies(deps: TrackedSpeciesDeps) {
  return defineTrackedEntity({
    type: SPECIES_ENTITY_TYPE,
    table: species,
    baseSchema: SpeciesBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    groups: [SPECIES_DEFINITION_GROUP],
    access: customOnlyAccess<SpeciesRow>(deps),
    fields: {
      code: field.value(),
      // Long texts and definitions, so fewer versions are kept.
      description: field.value({ history: "low" }),
      creatureType: field.value(),
      lifespanMode: field.value(),
      displayOrder: field.value(),
      sizeOptions: field.value(),
      movementModes: field.value(),
      ageProfile: field.value(),
      physicalProfile: field.value(),
      textSections: field.value({ history: "low" }),
      variantGroups: field.value(),
      featureGrants: field.value({ history: "low" }),
      // Set once when the species is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseSpeciesDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertSpeciesConsistent({ ...next, definition: parseSpeciesDefinition(next) }, db);
    },
  });
}

/** History rules of variants; in the history of their asset they appear as a child. */
export function createTrackedSpeciesVariant(deps: TrackedSpeciesDeps) {
  return defineTrackedEntity({
    type: SPECIES_VARIANT_ENTITY_TYPE,
    table: speciesVariants,
    baseSchema: SpeciesVariantBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    access: customOnlyAccess<SpeciesVariantRow>(deps),
    fields: {
      code: field.value(),
      description: field.value({ history: "low" }),
      variantGroupCode: field.value(),
      displayOrder: field.value(),
      featureGrants: field.value({ history: "low" }),
      // Set once when the variant is created; a variant never moves to another species.
      campaignId: field.ignore(),
      assetId: field.ignore(),
      speciesId: field.ignore(),
    },
    validate: (next) => {
      parseVariantGrants(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertVariantConsistent({ ...next, featureGrants: parseVariantGrants(next) }, db);
    },
  });
}

export type TrackedSpecies = ReturnType<typeof createTrackedSpecies>;
export type TrackedSpeciesVariant = ReturnType<typeof createTrackedSpeciesVariant>;
