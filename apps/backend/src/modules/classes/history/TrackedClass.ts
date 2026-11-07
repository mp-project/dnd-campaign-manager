import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { ClassBaseSchema } from "#src/modules/classes/domain/dto/BaseClassDto";
import {
  type ClassDefinition,
  ClassDefinitionSchema,
} from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { validateClassDefinition } from "#src/modules/classes/domain/ClassDefinition";
import {
  CLASS_DEFINITION_PARTS,
  classes,
} from "#src/modules/classes/domain/entities/ClassesTable";
import type { ClassRow } from "#src/modules/classes/domain/repository/ClassesRepository";

export const CLASS_ENTITY_TYPE = "class";

export const CLASS_ACTIONS = {
  create: "class.create",
  update: "class.update",
  delete: "class.delete",
  restore: "class.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const CLASS_ASSET_ACTIONS: readonly string[] = [
  CLASS_ACTIONS.update,
  CLASS_ACTIONS.delete,
  CLASS_ACTIONS.restore,
];

/** Definition parts plus the level settings they depend on; one unit in conflict checks. */
export const CLASS_DEFINITION_GROUP = [
  "maximumLevel",
  "subclassSelectionLevel",
  ...CLASS_DEFINITION_PARTS,
] as const;

type ParsableClassRow = Pick<
  ClassRow,
  (typeof CLASS_DEFINITION_PARTS)[number] | "maximumLevel" | "subclassSelectionLevel"
>;

type TrackedClassDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  /**
   * Checks the referenced assets, feature parameters, the code and that the asset may still change.
   * Runs for every change, so undoing and restoring cannot bring back an unavailable target.
   */
  assertConsistent(row: ClassRow & { definition: ClassDefinition }, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseClassDefinition(row: ParsableClassRow): ClassDefinition {
  const parsed = ClassDefinitionSchema.safeParse({
    primaryAbilities: row.primaryAbilities,
    proficiencies: row.proficiencies,
    startingEquipment: row.startingEquipment,
    progressionTracks: row.progressionTracks,
    levels: row.levels,
    choices: row.choices,
    spellcasting: row.spellcasting,
    multiclass: row.multiclass,
  });

  if (!parsed.success) {
    throw new ValidationError("Class definition is invalid", parsed.error.issues);
  }

  const issues = validateClassDefinition(row, parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Class definition is invalid", issues);
  }

  return parsed.data;
}

/**
 * History rules of class definitions. Custom classes: GMs and editors may change them, so only they
 * read the history. Global classes are changed by administrators only, who pass every check anyway.
 * In the history of the asset the class appears as a child; name, summary, status and rulesets are
 * fields of the asset and follow its rights.
 */
export function createTrackedClass(deps: TrackedClassDeps) {
  const campaignAccess = campaignHistoryAccess<ClassRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return defineTrackedEntity({
    type: CLASS_ENTITY_TYPE,
    table: classes,
    baseSchema: ClassBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    // Parts refer to each other by key and depend on the level settings, so a change to one of
    // them is a conflict with a change to any other; a mix of two versions could be inconsistent.
    groups: [CLASS_DEFINITION_GROUP],
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
      maximumLevel: field.value(),
      hitDie: field.value(),
      firstLevelHitPoints: field.value(),
      fixedHitPointsPerLevel: field.value(),
      subclassSelectionLevel: field.value(),
      displayOrder: field.value(),
      primaryAbilities: field.value(),
      proficiencies: field.value({ history: "low" }),
      startingEquipment: field.value({ history: "low" }),
      progressionTracks: field.value({ history: "low" }),
      levels: field.value({ history: "low" }),
      choices: field.value({ history: "low" }),
      spellcasting: field.value({ history: "low" }),
      multiclass: field.value(),
      // Set once when the class is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseClassDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertConsistent({ ...next, definition: parseClassDefinition(next) }, db);
    },
  });
}

export type TrackedClass = ReturnType<typeof createTrackedClass>;
