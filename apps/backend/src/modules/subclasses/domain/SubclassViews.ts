import { stripHiddenGrants } from "#src/modules/classes/index";
import type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import { listSubclassGrants } from "#src/modules/subclasses/domain/SubclassDefinition";
import type { SubclassBase } from "#src/modules/subclasses/domain/repository/SubclassesRepository";

/**
 * Read models of one subclass, for the catalog routes and for actor progression. Pure: the caller
 * loads the subclass and, for players, strips hidden references first (`toPlayerSubclassDefinition`).
 */

const byDisplayOrder = <T extends { displayOrder: number }>(items: readonly T[]) =>
  [...items].sort((left, right) => left.displayOrder - right.displayOrder);

/**
 * The subclass columns of the class table: one row per class level from the selection level to
 * the maximum, with the track values, grants, choices and spells of that level. Choices without a
 * level are made when the subclass is chosen.
 */
export function getProgression(base: SubclassBase, definition: SubclassDefinition) {
  const tracks = byDisplayOrder(definition.progressionTracks);
  const levels = Array.from(
    { length: Math.max(0, base.maximumLevel - base.selectionLevel + 1) },
    (_, index) => base.selectionLevel + index,
  );

  return {
    selectionLevel: base.selectionLevel,
    maximumLevel: base.maximumLevel,
    tracks: tracks.map((track) => ({
      key: track.key,
      label: track.label,
      valueType: track.valueType,
      unit: track.unit,
      displayOrder: track.displayOrder,
    })),
    levels: levels.map((level) => ({
      level,
      values: tracks.map((track) => ({
        trackKey: track.key,
        value: track.values.find((value) => value.level === level)?.value ?? null,
      })),
      featureGrantKeys: byDisplayOrder(
        definition.levels.find((entry) => entry.level === level)?.featureGrants ?? [],
      ).map((grant) => grant.key),
      choiceKeys: definition.choices
        .filter((choice) => (choice.level ?? base.selectionLevel) === level)
        .map((choice) => choice.key),
      spellGrantKeys: byDisplayOrder(
        definition.spellGrants.filter((grant) => grant.level === level),
      ).map((grant) => grant.key),
    })),
  };
}

export function getFeatureGrants(definition: Pick<SubclassDefinition, "levels">) {
  return listSubclassGrants(definition)
    .sort((left, right) => left.level - right.level || left.grant.displayOrder - right.grant.displayOrder)
    .map(({ level, grant }) => ({ level, ...grant }));
}

export function getChoices(base: SubclassBase, definition: Pick<SubclassDefinition, "choices">) {
  return {
    selectionLevel: base.selectionLevel,
    choices: [...definition.choices].sort(
      (left, right) =>
        (left.level ?? base.selectionLevel) - (right.level ?? base.selectionLevel) ||
        left.displayOrder - right.displayOrder,
    ),
  };
}

export function getSpellcasting(definition: Pick<SubclassDefinition, "spellcasting" | "spellGrants">) {
  return {
    spellcasting: definition.spellcasting,
    spellGrants: [...definition.spellGrants].sort(
      (left, right) => left.level - right.level || left.displayOrder - right.displayOrder,
    ),
  };
}

/** Grant keys of the subclass a character has at this class level, for actor progression. */
export function grantKeysUpTo(definition: Pick<SubclassDefinition, "levels">, classLevel: number) {
  return getFeatureGrants(definition)
    .filter((grant) => grant.level <= classLevel)
    .map((grant) => grant.key);
}

/**
 * The definition as a player may see it: grants and choices like those of a class
 * (`stripHiddenGrants`), hidden granted spells left out and a hidden spell list emptied.
 */
export function toPlayerSubclassDefinition(
  definition: SubclassDefinition,
  isVisible: (assetId: string) => boolean,
): SubclassDefinition {
  const { spellcasting } = definition;

  return {
    ...definition,
    ...stripHiddenGrants(definition, isVisible),
    spellGrants: definition.spellGrants.filter((grant) => isVisible(grant.spellAssetId)),
    spellcasting:
      spellcasting?.spellListAssetId && !isVisible(spellcasting.spellListAssetId)
        ? { ...spellcasting, spellListAssetId: null }
        : spellcasting,
  };
}
