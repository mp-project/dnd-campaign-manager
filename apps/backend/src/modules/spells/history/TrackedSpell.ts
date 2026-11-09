import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { SpellBaseSchema, SpellListBaseSchema } from "#src/modules/spells/domain/dto/BaseSpellDto";
import {
  type SpellDefinition,
  SpellDefinitionSchema,
  SpellListEntriesSchema,
  SpellListIdsSchema,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import {
  SPELL_DEFINITION_PARTS,
  spellLists,
  spells,
} from "#src/modules/spells/domain/entities/SpellsTable";
import type { SpellListRow, SpellRow } from "#src/modules/spells/domain/repository/SpellsRepository";
import { validateSpellDefinition } from "#src/modules/spells/domain/SpellDefinition";

export const SPELL_ENTITY_TYPE = "spell";
export const SPELL_LIST_ENTITY_TYPE = "spellList";

export const SPELL_ACTIONS = {
  create: "spell.create",
  update: "spell.update",
  delete: "spell.delete",
  restore: "spell.restore",
  createList: "spellList.create",
  updateList: "spellList.update",
  deleteList: "spellList.delete",
  restoreList: "spellList.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const SPELL_ASSET_ACTIONS: readonly string[] = [
  SPELL_ACTIONS.update,
  SPELL_ACTIONS.delete,
  SPELL_ACTIONS.restore,
  SPELL_ACTIONS.updateList,
  SPELL_ACTIONS.deleteList,
  SPELL_ACTIONS.restoreList,
];

/**
 * The definition parts and the core fields they depend on refer to each other (effects to
 * targets, slot scaling to the level, a trigger to the casting time), so they are one unit in
 * conflict checks.
 */
export const SPELL_DEFINITION_GROUP = [
  ...SPELL_DEFINITION_PARTS,
  // Part of the rule "a description, a section or an effect".
  "description",
  "level",
  "isRitual",
  "castingTimeType",
  "castingTimeAmount",
  "castingTrigger",
  "rangeType",
  "rangeDistance",
  "rangeUnit",
  "durationType",
  "durationAmount",
  "durationUnit",
  "requiresConcentration",
  "componentMaterial",
] as const;

type TrackedDeps = {
  resolveRole(campaignId: string, actorId: string, db: AppDatabase): Promise<CampaignRole | null>;
  /**
   * Refuses changes to content whose asset is archived. Codes, references and the other rules
   * across rows are checked at the end of the action (`verifyContent`).
   */
  assertChangeable(assetId: string, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across fields; throws 400 with all issues. */
export function parseSpellDefinition(row: SpellRow): SpellDefinition {
  const parsed = SpellDefinitionSchema.safeParse({
    sections: row.sections,
    materials: row.materials,
    requirements: row.requirements,
    targets: row.targets,
    choices: row.choices,
    scalingTracks: row.scalingTracks,
    effects: row.effects,
  });

  if (!parsed.success) {
    throw new ValidationError("Spell definition is invalid", parsed.error.issues);
  }

  const issues = validateSpellDefinition({ ...row, ...parsed.data });

  if (issues.length > 0) {
    throw new ValidationError("Spell definition is invalid", issues);
  }

  return parsed.data;
}

/** The definition for a read; one that no longer parses is a conflict (409) until it is fixed. */
export function readSpellDefinition(row: SpellRow): SpellDefinition {
  try {
    return parseSpellDefinition(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored spell definition is invalid; see validate", {
        spellId: row.id,
      });
    }

    throw error;
  }
}

/** The definition, or null when it no longer parses. */
export function tryParseSpellDefinition(row: SpellRow): SpellDefinition | null {
  try {
    return parseSpellDefinition(row);
  } catch {
    return null;
  }
}

/** The lists a stored spell names; empty when the value no longer parses. */
export function storedSpellListIds(row: Pick<SpellRow, "spellListIds">): string[] {
  const parsed = SpellListIdsSchema.safeParse(row.spellListIds);

  return parsed.success ? parsed.data : [];
}

/** The entries of a stored list; empty when the value no longer parses. */
export function storedSpellIds(row: Pick<SpellListRow, "spellIds">): string[] {
  const parsed = SpellListEntriesSchema.safeParse(row.spellIds);

  return parsed.success ? parsed.data : [];
}

/**
 * Custom content is changed by GMs and editors, so only they read the history; global content by
 * administrators only, who pass every check anyway. Name, summary, status and rulesets are fields
 * of the asset and follow its rights.
 */
function contentAccess<Row extends { campaignId: string | null }>(deps: TrackedDeps) {
  const campaignAccess = campaignHistoryAccess<Row>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return {
    read: async (context: Parameters<typeof campaignAccess.read>[0], row: Row, db: AppDatabase) =>
      row.campaignId !== null && campaignAccess.read(context, row, db),
    readField: async (
      context: Parameters<typeof campaignAccess.read>[0],
      row: Row,
      name: string,
      db: AppDatabase,
    ) =>
      row.campaignId !== null &&
      ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
    revert: async (
      context: Parameters<typeof campaignAccess.read>[0],
      row: Row,
      change: Parameters<NonNullable<typeof campaignAccess.revert>>[2],
      db: AppDatabase,
    ) => row.campaignId !== null && ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
    restore: async (context: Parameters<typeof campaignAccess.read>[0], row: Row, db: AppDatabase) =>
      row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
  };
}

export function createTrackedSpell(deps: TrackedDeps) {
  return defineTrackedEntity({
    type: SPELL_ENTITY_TYPE,
    table: spells,
    baseSchema: SpellBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    groups: [SPELL_DEFINITION_GROUP],
    access: contentAccess<SpellRow>(deps),
    fields: {
      code: field.value(),
      level: field.value(),
      school: field.value(),
      // Long texts and definitions, so fewer versions are kept.
      description: field.value({ history: "low" }),
      higherLevelDescription: field.value({ history: "low" }),
      isRitual: field.value(),
      castingTimeType: field.value(),
      castingTimeAmount: field.value(),
      castingTrigger: field.value(),
      rangeType: field.value(),
      rangeDistance: field.value(),
      rangeUnit: field.value(),
      durationType: field.value(),
      durationAmount: field.value(),
      durationUnit: field.value(),
      requiresConcentration: field.value(),
      componentVerbal: field.value(),
      componentSomatic: field.value(),
      componentMaterial: field.value(),
      sections: field.value({ history: "low" }),
      materials: field.value(),
      requirements: field.value(),
      targets: field.value(),
      choices: field.value({ history: "low" }),
      scalingTracks: field.value(),
      effects: field.value({ history: "low" }),
      spellListIds: field.value(),
      // Set once when the spell is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseSpellDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next.assetId, db);
    },
  });
}

export function createTrackedSpellList(deps: TrackedDeps) {
  return defineTrackedEntity({
    type: SPELL_LIST_ENTITY_TYPE,
    table: spellLists,
    baseSchema: SpellListBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    access: contentAccess<SpellListRow>(deps),
    fields: {
      code: field.value(),
      description: field.value({ history: "low" }),
      spellIds: field.value({ history: "low" }),
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      const parsed = SpellListEntriesSchema.safeParse(next.spellIds);

      if (!parsed.success) {
        throw new ValidationError("Spell list entries are invalid", parsed.error.issues);
      }
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next.assetId, db);
    },
  });
}

export type TrackedSpell = ReturnType<typeof createTrackedSpell>;
export type TrackedSpellList = ReturnType<typeof createTrackedSpellList>;
