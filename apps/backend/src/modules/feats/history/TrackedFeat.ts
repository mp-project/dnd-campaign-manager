import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { FeatBaseSchema } from "#src/modules/feats/domain/dto/BaseFeatDto";
import {
  type FeatDefinition,
  FeatDefinitionSchema,
} from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import { FEAT_DEFINITION_PARTS, feats } from "#src/modules/feats/domain/entities/FeatsTable";
import { validateFeatDefinition } from "#src/modules/feats/domain/FeatDefinition";
import type { FeatRow } from "#src/modules/feats/domain/repository/FeatsRepository";

export const FEAT_ENTITY_TYPE = "feat";

export const FEAT_ACTIONS = {
  create: "feat.create",
  update: "feat.update",
  delete: "feat.delete",
  restore: "feat.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const FEAT_ASSET_ACTIONS: readonly string[] = [
  FEAT_ACTIONS.update,
  FEAT_ACTIONS.delete,
  FEAT_ACTIONS.restore,
];

/** The definition parts refer to each other by key; one unit in conflict checks. */
export const FEAT_DEFINITION_GROUP = FEAT_DEFINITION_PARTS;

type ParsableFeatRow = Pick<FeatRow, (typeof FEAT_DEFINITION_PARTS)[number]>;

type TrackedFeatDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
  /**
   * Refuses changes to a feat whose asset is archived. Code, category, references and the other
   * rules across rows are checked at the end of the action (`FeatsService.verifyContent`).
   */
  assertChangeable(row: FeatRow, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseFeatDefinition(row: ParsableFeatRow): FeatDefinition {
  const parsed = FeatDefinitionSchema.safeParse({
    prerequisites: row.prerequisites,
    repeatability: row.repeatability,
    choices: row.choices,
    featureGrants: row.featureGrants,
  });

  if (!parsed.success) {
    throw new ValidationError("Feat definition is invalid", parsed.error.issues);
  }

  const issues = validateFeatDefinition(parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Feat definition is invalid", issues);
  }

  return parsed.data;
}

/** The definition for a read; one that no longer parses is a conflict (409) until it is fixed. */
export function readFeatDefinition(row: ParsableFeatRow & { id?: string }): FeatDefinition {
  try {
    return parseFeatDefinition(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored feat definition is invalid; see validate", {
        featId: row.id,
      });
    }

    throw error;
  }
}

/** The definition, or null when it no longer parses. */
export function tryParseFeatDefinition(row: ParsableFeatRow): FeatDefinition | null {
  try {
    return parseFeatDefinition(row);
  } catch {
    return null;
  }
}

/**
 * History rules of feats, like classes: custom feats are changed by GMs and editors, so only they
 * read the history; global ones by administrators only, who pass every check anyway. Name,
 * summary, status and rulesets are fields of the asset and follow its rights.
 */
export function createTrackedFeat(deps: TrackedFeatDeps) {
  const campaignAccess = campaignHistoryAccess<FeatRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return defineTrackedEntity({
    type: FEAT_ENTITY_TYPE,
    table: feats,
    baseSchema: FeatBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    // Parts refer to each other by key (repeatability and bindings to choices), so a change to one
    // of them is a conflict with a change to any other.
    groups: [FEAT_DEFINITION_GROUP],
    access: {
      read: async (context, row, db) =>
        row.campaignId !== null && campaignAccess.read(context, row, db),
      readField: async (context, row, name, db) =>
        row.campaignId !== null &&
        ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
      revert: async (context, row, change, db) =>
        row.campaignId !== null &&
        ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
      restore: async (context, row, db) =>
        row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
    },
    fields: {
      code: field.value(),
      // Long texts and definitions, so fewer versions are kept.
      description: field.value({ history: "low" }),
      category: field.value(),
      minimumCharacterLevel: field.value(),
      prerequisiteCheckMode: field.value(),
      displayOrder: field.value(),
      prerequisites: field.value({ history: "low" }),
      repeatability: field.value(),
      choices: field.value({ history: "low" }),
      featureGrants: field.value({ history: "low" }),
      // Set once when the feat is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseFeatDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next, db);
    },
  });
}

export type TrackedFeat = ReturnType<typeof createTrackedFeat>;
