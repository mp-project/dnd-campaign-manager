import type { ClassDefinition } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { listGrants } from "#src/modules/classes/domain/ClassDefinition";
import type { ClassRow } from "#src/modules/classes/domain/repository/ClassesRepository";

/**
 * Read models of one class, for the catalog routes and for actor progression. Pure: the caller
 * loads the class and, for players, strips hidden references first. The proficiency bonus is not
 * part of a class; it follows the total character level of the ruleset.
 */

type CoreRow = Pick<
  ClassRow,
  "hitDie" | "maximumLevel" | "firstLevelHitPoints" | "fixedHitPointsPerLevel" | "subclassSelectionLevel"
>;

const byDisplayOrder = <T extends { displayOrder: number }>(items: readonly T[]) =>
  [...items].sort((left, right) => left.displayOrder - right.displayOrder);

export function getCoreTraits(row: CoreRow, definition: ClassDefinition) {
  return {
    hitDie: row.hitDie,
    maximumLevel: row.maximumLevel,
    firstLevelHitPoints: row.firstLevelHitPoints,
    fixedHitPointsPerLevel: row.fixedHitPointsPerLevel,
    subclassSelectionLevel: row.subclassSelectionLevel,
    primaryAbilities: definition.primaryAbilities,
  };
}

/** The class table: one row per level with the track values, grants and choices of that level. */
export function getProgression(row: CoreRow, definition: ClassDefinition) {
  const tracks = byDisplayOrder(definition.progressionTracks);

  return {
    maximumLevel: row.maximumLevel,
    tracks: tracks.map((track) => ({
      key: track.key,
      label: track.label,
      valueType: track.valueType,
      unit: track.unit,
      displayOrder: track.displayOrder,
    })),
    levels: definition.levels.map((entry) => ({
      level: entry.level,
      values: tracks.map((track) => ({
        trackKey: track.key,
        value: track.values.find((value) => value.level === entry.level)?.value ?? null,
      })),
      featureGrantKeys: byDisplayOrder(entry.featureGrants).map((grant) => grant.key),
      choiceKeys: definition.choices
        .filter((choice) => choice.level === entry.level)
        .map((choice) => choice.key),
    })),
  };
}

export function getFeatureGrants(definition: ClassDefinition) {
  return listGrants(definition)
    .sort((left, right) => left.level - right.level || left.grant.displayOrder - right.grant.displayOrder)
    .map(({ level, grant }) => ({ level, ...grant }));
}

export function getChoiceDefinitions(row: Pick<ClassRow, "subclassSelectionLevel">, definition: ClassDefinition) {
  return {
    subclassSelectionLevel: row.subclassSelectionLevel,
    choices: [...definition.choices].sort(
      (left, right) =>
        (left.level ?? 0) - (right.level ?? 0) || left.displayOrder - right.displayOrder,
    ),
  };
}

export function getStartingEquipment(definition: Pick<ClassDefinition, "startingEquipment">) {
  return { options: byDisplayOrder(definition.startingEquipment) };
}

/** Proficiencies of a class taken at level 1, and the smaller set for multiclassing into it. */
export function getProficiencyGrants(definition: Pick<ClassDefinition, "proficiencies">) {
  const rules = byDisplayOrder(definition.proficiencies);

  return {
    startingClass: rules.filter((rule) => rule.acquisitionMode === "STARTING_CLASS"),
    multiclass: rules.filter((rule) => rule.acquisitionMode === "MULTICLASS"),
  };
}

export function getSpellcastingProfile(definition: Pick<ClassDefinition, "spellcasting">) {
  return { spellcasting: definition.spellcasting };
}

/** Ability scores needed to multiclass into the class, and the proficiencies it then grants. */
export function getMulticlassRequirements(definition: Pick<ClassDefinition, "multiclass" | "proficiencies">) {
  return {
    combinationMode: definition.multiclass.combinationMode,
    abilityRequirements: definition.multiclass.abilityRequirements,
    proficiencies: getProficiencyGrants(definition).multiclass,
  };
}

/**
 * Whether ability scores meet the multiclass requirements. Missing scores count as not met; a
 * class without requirements is always open.
 */
export function meetsMulticlassRequirements(
  definition: Pick<ClassDefinition, "multiclass">,
  abilities: Partial<Record<string, number>>,
): boolean {
  const { combinationMode, abilityRequirements } = definition.multiclass;

  if (abilityRequirements.length === 0) {
    return true;
  }

  const met = abilityRequirements.map(
    (requirement) => (abilities[requirement.ability] ?? 0) >= requirement.minimum,
  );

  return combinationMode === "ALL" ? met.every(Boolean) : met.some(Boolean);
}
