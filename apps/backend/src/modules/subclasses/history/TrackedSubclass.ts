import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { SubclassBaseSchema } from "#src/modules/subclasses/domain/dto/BaseSubclassDto";
import {
  type SubclassDefinition,
  SubclassDefinitionSchema,
} from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import { validateSubclassDefinition } from "#src/modules/subclasses/domain/SubclassDefinition";
import {
  SUBCLASS_DEFINITION_PARTS,
  subclasses,
} from "#src/modules/subclasses/domain/entities/SubclassesTable";
import type { SubclassRow } from "#src/modules/subclasses/domain/repository/SubclassesRepository";

export const SUBCLASS_ENTITY_TYPE = "subclass";

export const SUBCLASS_ACTIONS = {
  create: "subclass.create",
  update: "subclass.update",
  delete: "subclass.delete",
  restore: "subclass.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const SUBCLASS_ASSET_ACTIONS: readonly string[] = [
  SUBCLASS_ACTIONS.update,
  SUBCLASS_ACTIONS.delete,
  SUBCLASS_ACTIONS.restore,
];

/** Definition parts; one unit in conflict checks. */
export const SUBCLASS_DEFINITION_GROUP = SUBCLASS_DEFINITION_PARTS;

type ParsableSubclassRow = Pick<SubclassRow, (typeof SUBCLASS_DEFINITION_PARTS)[number]>;

type TrackedSubclassDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
  /**
   * Refuses changes to a subclass whose asset is archived. The class, references and the other
   * rules across rows are checked at the end of the action (`SubclassesService.verifyContent`).
   */
  assertChangeable(row: SubclassRow, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseSubclassDefinition(row: ParsableSubclassRow): SubclassDefinition {
  const parsed = SubclassDefinitionSchema.safeParse({
    levels: row.levels,
    progressionTracks: row.progressionTracks,
    choices: row.choices,
    spellcasting: row.spellcasting,
    spellGrants: row.spellGrants,
  });

  if (!parsed.success) {
    throw new ValidationError("Subclass definition is invalid", parsed.error.issues);
  }

  const issues = validateSubclassDefinition(parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Subclass definition is invalid", issues);
  }

  return parsed.data;
}

/**
 * History rules of subclass definitions, like those of classes: custom subclasses are changed by
 * GMs and editors, so only they read the history; global ones by administrators only, who pass
 * every check anyway. In the history of the asset the subclass appears as a child.
 */
export function createTrackedSubclass(deps: TrackedSubclassDeps) {
  const campaignAccess = campaignHistoryAccess<SubclassRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return defineTrackedEntity({
    type: SUBCLASS_ENTITY_TYPE,
    table: subclasses,
    baseSchema: SubclassBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    // Parts refer to each other by key, so a change to one of them is a conflict with a change to
    // any other; a mix of two versions could be inconsistent.
    groups: [SUBCLASS_DEFINITION_GROUP],
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
      displayOrder: field.value(),
      levels: field.value({ history: "low" }),
      progressionTracks: field.value({ history: "low" }),
      choices: field.value({ history: "low" }),
      spellcasting: field.value({ history: "low" }),
      spellGrants: field.value({ history: "low" }),
      // Set once when the subclass is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
      classId: field.ignore(),
    },
    validate: (next) => {
      parseSubclassDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next, db);
    },
  });
}

export type TrackedSubclass = ReturnType<typeof createTrackedSubclass>;
