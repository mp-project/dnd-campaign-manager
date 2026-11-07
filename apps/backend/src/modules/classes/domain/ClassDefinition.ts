import type { AssetReference } from "#src/modules/assets/index";
import {
  CHOICE_ASSET_TYPES,
  type ClassDefinition,
  type FeatureGrant,
} from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { CONTEXT_VALUE_KEYS } from "#src/modules/features/index";

export type DefinitionIssue = { path: (string | number)[]; message: string };

/** Level settings that the definition parts depend on. */
export type ClassLevelSettings = { maximumLevel: number; subclassSelectionLevel: number };

/** A grant with the level it belongs to and where it is in the definition. */
export type LocatedGrant = { level: number; levelIndex: number; grantIndex: number; grant: FeatureGrant };

export function listGrants(definition: Pick<ClassDefinition, "levels">): LocatedGrant[] {
  return definition.levels.flatMap((entry, levelIndex) =>
    entry.featureGrants.map((grant, grantIndex) => ({
      level: entry.level,
      levelIndex,
      grantIndex,
      grant,
    })),
  );
}

function duplicates(keys: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      repeated.add(key);
    }

    seen.add(key);
  }

  return repeated;
}

/**
 * Rules across the parts of a definition that need no database: one level entry per level from 1 to
 * the maximum, unique keys, references by key, level ranges and the subclass choice. Asset
 * references and feature parameters are checked by the service.
 */
export function validateClassDefinition(
  settings: ClassLevelSettings,
  definition: ClassDefinition,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  const { maximumLevel, subclassSelectionLevel } = settings;
  const grants = listGrants(definition);
  const grantLevels = new Map(grants.map(({ grant, level }) => [grant.key, level]));
  const choiceKeys = new Set(definition.choices.map((choice) => choice.key));
  const trackKeys = new Set(definition.progressionTracks.map((track) => track.key));

  if (subclassSelectionLevel > maximumLevel) {
    add(["subclassSelectionLevel"], "The subclass is chosen at or below the maximum level");
  }

  if (
    definition.levels.length !== maximumLevel ||
    definition.levels.some((entry, index) => entry.level !== index + 1)
  ) {
    add(["levels"], `Levels must be 1 to ${maximumLevel}, each once and in order`);
  }

  const uniqueKeyChecks: [string, readonly string[]][] = [
    ["proficiencies", definition.proficiencies.map((rule) => rule.key)],
    ["startingEquipment", definition.startingEquipment.map((option) => option.code)],
    ["progressionTracks", definition.progressionTracks.map((track) => track.key)],
    ["choices", definition.choices.map((choice) => choice.key)],
    ["levels", grants.map(({ grant }) => grant.key)],
  ];

  for (const [part, keys] of uniqueKeyChecks) {
    for (const key of duplicates(keys)) {
      add([part], `Key '${key}' is used more than once`);
    }
  }

  definition.progressionTracks.forEach((track, trackIndex) =>
    track.values.forEach((entry, valueIndex) => {
      if (entry.level > maximumLevel) {
        add(["progressionTracks", trackIndex, "values", valueIndex, "level"], "Level is above the maximum level");
      }
    }),
  );

  for (const { grant, levelIndex, grantIndex } of grants) {
    const path = ["levels", levelIndex, "featureGrants", grantIndex];

    if (grant.choiceKey !== null && !choiceKeys.has(grant.choiceKey)) {
      add([...path, "choiceKey"], `Unknown choice '${grant.choiceKey}'`);
    }

    grant.bindings.forEach((binding, bindingIndex) => {
      const bindingPath = [...path, "bindings", bindingIndex];

      if (binding.bindingSource === "CLASS_CHOICE" && !choiceKeys.has(binding.choiceKey ?? "")) {
        add([...bindingPath, "choiceKey"], `Unknown choice '${binding.choiceKey}'`);
      }

      if (binding.bindingSource === "PROGRESSION_TRACK" && !trackKeys.has(binding.trackKey ?? "")) {
        add([...bindingPath, "trackKey"], `Unknown progression track '${binding.trackKey}'`);
      }

      if (binding.bindingSource === "CONTEXT" && !CONTEXT_VALUE_KEYS.includes(binding.contextKey ?? "")) {
        add([...bindingPath, "contextKey"], `Unknown context value '${binding.contextKey}'`);
      }
    });
  }

  definition.choices.forEach((choice, index) => {
    const path = ["choices", index];

    if (choice.level !== null && choice.level > maximumLevel) {
      add([...path, "level"], "Level is above the maximum level");
    }

    if (choice.grantKey !== null) {
      const grantLevel = grantLevels.get(choice.grantKey);

      if (grantLevel === undefined) {
        add([...path, "grantKey"], `Unknown feature grant '${choice.grantKey}'`);
      } else if (choice.level !== null && choice.level !== grantLevel) {
        add([...path, "level"], "A choice of a grant is made at the level of the grant");
      }
    }
  });

  const subclassChoices = definition.choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => choice.choiceType === "SUBCLASS");

  if (subclassChoices.length !== 1) {
    add(["choices"], "A class needs exactly one subclass choice");
  }

  for (const { choice, index } of subclassChoices) {
    if (choice.level !== subclassSelectionLevel) {
      add(["choices", index, "level"], "The subclass choice is made at the subclass selection level");
    }

    if (choice.minimumSelections !== 1 || choice.maximumSelections !== 1) {
      add(["choices", index], "Exactly one subclass is chosen");
    }
  }

  const { spellcasting } = definition;

  if (spellcasting) {
    if (spellcasting.unlockLevel !== null && spellcasting.unlockLevel > maximumLevel) {
      add(["spellcasting", "unlockLevel"], "Level is above the maximum level");
    }

    spellcasting.levels.forEach((entry, index) => {
      if (entry.level > maximumLevel) {
        add(["spellcasting", "levels", index, "level"], "Level is above the maximum level");
      }
    });
  }

  return issues;
}

/** Every asset the definition refers to, with the asset types allowed there. */
export function collectClassReferences(definition: ClassDefinition): AssetReference[] {
  const references: AssetReference[] = [];

  definition.proficiencies.forEach((rule, ruleIndex) =>
    rule.options.forEach((option, optionIndex) => {
      if (option.assetId) {
        references.push({
          assetId: option.assetId,
          path: ["proficiencies", ruleIndex, "options", optionIndex, "assetId"],
          assetTypes: ["ITEM"],
        });
      }
    }),
  );
  definition.startingEquipment.forEach((option, optionIndex) =>
    option.entries.forEach((entry, entryIndex) => {
      if (entry.itemAssetId) {
        references.push({
          assetId: entry.itemAssetId,
          path: ["startingEquipment", optionIndex, "entries", entryIndex, "itemAssetId"],
          assetTypes: ["ITEM"],
        });
      }
    }),
  );

  for (const { grant, levelIndex, grantIndex } of listGrants(definition)) {
    const path = ["levels", levelIndex, "featureGrants", grantIndex];

    references.push({ assetId: grant.featureAssetId, path: [...path, "featureAssetId"], assetTypes: ["FEATURE"] });

    if (grant.targetFeatureAssetId) {
      references.push({
        assetId: grant.targetFeatureAssetId,
        path: [...path, "targetFeatureAssetId"],
        assetTypes: ["FEATURE"],
      });
    }
  }

  definition.choices.forEach((choice, choiceIndex) =>
    choice.options.forEach((option, optionIndex) => {
      if (option.linkedAssetId) {
        references.push({
          assetId: option.linkedAssetId,
          path: ["choices", choiceIndex, "options", optionIndex, "linkedAssetId"],
          assetTypes: CHOICE_ASSET_TYPES[choice.choiceType],
        });
      }
    }),
  );

  if (definition.spellcasting?.spellListAssetId) {
    references.push({
      assetId: definition.spellcasting.spellListAssetId,
      path: ["spellcasting", "spellListAssetId"],
      assetTypes: ["SPELL_LIST"],
    });
  }

  return references;
}
