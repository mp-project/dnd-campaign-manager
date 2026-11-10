import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import {
  type BackgroundDefinition,
  BackgroundDefinitionSchema,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import { BackgroundBaseSchema } from "#src/modules/backgrounds/domain/dto/BaseBackgroundDto";
import { validateBackgroundDefinition } from "#src/modules/backgrounds/domain/BackgroundDefinition";
import {
  BACKGROUND_DEFINITION_PARTS,
  backgrounds,
} from "#src/modules/backgrounds/domain/entities/BackgroundsTable";
import type { BackgroundRow } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";

export const BACKGROUND_ENTITY_TYPE = "background";

export const BACKGROUND_ACTIONS = {
  create: "background.create",
  update: "background.update",
  delete: "background.delete",
  restore: "background.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const BACKGROUND_ASSET_ACTIONS: readonly string[] = [
  BACKGROUND_ACTIONS.update,
  BACKGROUND_ACTIONS.delete,
  BACKGROUND_ACTIONS.restore,
];

/**
 * The definition parts and the customization mode are checked together (edition rules, keys
 * across parts); one unit in conflict checks.
 */
export const BACKGROUND_DEFINITION_GROUP = [...BACKGROUND_DEFINITION_PARTS, "customizationMode"] as const;

type ParsableBackgroundRow = Pick<BackgroundRow, (typeof BACKGROUND_DEFINITION_PARTS)[number]>;

type TrackedBackgroundDeps = {
  resolveRole(campaignId: string, actorId: string, db: AppDatabase): Promise<CampaignRole | null>;
  /**
   * Refuses changes to a background whose asset is archived. Code, edition rules, references and
   * the other rules across rows are checked at the end of the action (`verifyContent`).
   */
  assertChangeable(row: BackgroundRow, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseBackgroundDefinition(row: ParsableBackgroundRow): BackgroundDefinition {
  const parsed = BackgroundDefinitionSchema.safeParse({
    sections: row.sections,
    abilityRule: row.abilityRule,
    proficiencyGrants: row.proficiencyGrants,
    featGrants: row.featGrants,
    featureGrants: row.featureGrants,
    equipmentOptions: row.equipmentOptions,
    promptTables: row.promptTables,
  });

  if (!parsed.success) {
    throw new ValidationError("Background definition is invalid", parsed.error.issues);
  }

  const issues = validateBackgroundDefinition(parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Background definition is invalid", issues);
  }

  return parsed.data;
}

/** The definition for a read; one that no longer parses is a conflict (409) until it is fixed. */
export function readBackgroundDefinition(row: ParsableBackgroundRow & { id?: string }): BackgroundDefinition {
  try {
    return parseBackgroundDefinition(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored background definition is invalid; see validate", {
        backgroundId: row.id,
      });
    }

    throw error;
  }
}

/** The definition, or null when it no longer parses. */
export function tryParseBackgroundDefinition(row: ParsableBackgroundRow): BackgroundDefinition | null {
  try {
    return parseBackgroundDefinition(row);
  } catch {
    return null;
  }
}

/**
 * History rules of backgrounds, like feats: custom backgrounds are changed by GMs and editors, so
 * only they read the history; global ones by administrators only, who pass every check anyway.
 * Name, summary, status and rulesets are fields of the asset and follow its rights.
 */
export function createTrackedBackground(deps: TrackedBackgroundDeps) {
  const campaignAccess = campaignHistoryAccess<BackgroundRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return defineTrackedEntity({
    type: BACKGROUND_ENTITY_TYPE,
    table: backgrounds,
    baseSchema: BackgroundBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    groups: [BACKGROUND_DEFINITION_GROUP],
    access: {
      read: async (context, row, db) => row.campaignId !== null && campaignAccess.read(context, row, db),
      readField: async (context, row, name, db) =>
        row.campaignId !== null && ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
      revert: async (context, row, change, db) =>
        row.campaignId !== null && ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
      restore: async (context, row, db) =>
        row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
    },
    fields: {
      code: field.value(),
      // Long texts and definitions, so fewer versions are kept.
      description: field.value({ history: "low" }),
      customizationMode: field.value(),
      displayOrder: field.value(),
      sections: field.value({ history: "low" }),
      abilityRule: field.value(),
      proficiencyGrants: field.value({ history: "low" }),
      featGrants: field.value(),
      featureGrants: field.value({ history: "low" }),
      equipmentOptions: field.value({ history: "low" }),
      promptTables: field.value({ history: "low" }),
      // Set once when the background is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseBackgroundDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next, db);
    },
  });
}

export type TrackedBackground = ReturnType<typeof createTrackedBackground>;
