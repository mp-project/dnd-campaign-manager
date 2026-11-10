import type { AssetReference } from "#src/modules/assets/index";
import {
  CHOICE_ASSET_TYPES,
  type ClassDefinition,
  type DefinitionIssue,
  type FeatureGrant,
} from "#src/modules/classes/index";
import { CONTEXT_VALUE_KEYS } from "#src/modules/features/index";
import type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";

/** What a subclass takes from its class: the level range and the class's own definition. */
export type SubclassClassContext = {
  maximumLevel: number;
  subclassSelectionLevel: number;
  definition: Pick<ClassDefinition, "levels" | "spellcasting">;
};

/** A grant with the level it belongs to and where it is in the definition. */
export type LocatedSubclassGrant = {
  level: number;
  levelIndex: number;
  grantIndex: number;
  grant: FeatureGrant;
};

export function listSubclassGrants(
  definition: Pick<SubclassDefinition, "levels">,
): LocatedSubclassGrant[] {
  return definition.levels.flatMap((entry, levelIndex) =>
    entry.featureGrants.map((grant, grantIndex) => ({
      level: entry.level,
      levelIndex,
      grantIndex,
      grant,
    })),
  );
}

export const grantPath = (located: Pick<LocatedSubclassGrant, "levelIndex" | "grantIndex">) => [
  "levels",
  located.levelIndex,
  "featureGrants",
  located.grantIndex,
];

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
 * Rules across the parts of a subclass definition that need neither database nor class: levels in
 * order, unique keys, references by key and no subclass choice of its own. The class rules follow
 * in `validateSubclassAgainstClass`, asset references and feature parameters in the service.
 */
export function validateSubclassDefinition(definition: SubclassDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  const grants = listSubclassGrants(definition);
  const grantLevels = new Map(grants.map(({ grant, level }) => [grant.key, level]));
  const choiceKeys = new Set(definition.choices.map((choice) => choice.key));
  const trackKeys = new Set(definition.progressionTracks.map((track) => track.key));

  if (
    definition.levels.some(
      (entry, index) => index > 0 && entry.level <= (definition.levels[index - 1]?.level ?? 0),
    )
  ) {
    add(["levels"], "Levels must be unique and ascending");
  }

  const uniqueKeyChecks: [string, readonly string[]][] = [
    ["levels", grants.map(({ grant }) => grant.key)],
    ["progressionTracks", definition.progressionTracks.map((track) => track.key)],
    ["choices", definition.choices.map((choice) => choice.key)],
    ["spellGrants", definition.spellGrants.map((grant) => grant.key)],
  ];

  for (const [part, keys] of uniqueKeyChecks) {
    for (const key of duplicates(keys)) {
      add([part], `Key '${key}' is used more than once`);
    }
  }

  for (const located of grants) {
    const { grant } = located;
    const path = grantPath(located);

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

    if (choice.choiceType === "SUBCLASS") {
      add([...path, "choiceType"], "A subclass has no subclass choice of its own");
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

  return issues;
}

/**
 * Rules of a subclass against its class: everything happens between the level the subclass is
 * chosen at and the maximum level of the class; upgrades and replacements apply to a feature the
 * class or the subclass grants by then (keys are the subclass's own: decisions name their source); a subclass only brings its own spellcasting to a class without one,
 * and spells it grants need a caster.
 */
export function validateSubclassAgainstClass(
  base: SubclassClassContext,
  definition: SubclassDefinition,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  const { maximumLevel, subclassSelectionLevel: selectionLevel } = base;
  const outOfRange = (level: number) => level < selectionLevel || level > maximumLevel;
  const rangeMessage = `Level must be between the subclass selection level ${selectionLevel} and the maximum level ${maximumLevel} of the class`;
  const classGrants = base.definition.levels.flatMap((entry) =>
    entry.featureGrants.map((grant) => ({ level: entry.level, grant })),
  );
  const grants = listSubclassGrants(definition);

  definition.levels.forEach((entry, index) => {
    if (outOfRange(entry.level)) {
      add(["levels", index, "level"], rangeMessage);
    }
  });

  definition.progressionTracks.forEach((track, trackIndex) =>
    track.values.forEach((entry, valueIndex) => {
      if (entry.level > maximumLevel) {
        add(["progressionTracks", trackIndex, "values", valueIndex, "level"], "Level is above the maximum level of the class");
      }
    }),
  );

  definition.choices.forEach((choice, index) => {
    if (choice.level !== null && outOfRange(choice.level)) {
      add(["choices", index, "level"], rangeMessage);
    }
  });

  definition.spellGrants.forEach((grant, index) => {
    if (outOfRange(grant.level)) {
      add(["spellGrants", index, "level"], rangeMessage);
    }
  });

  for (const located of grants) {
    const { grant, level } = located;
    const path = grantPath(located);

    if (grant.grantOperation !== "GRANT" && grant.targetFeatureAssetId !== null) {
      const target = grant.targetFeatureAssetId;
      const grantedBefore =
        classGrants.some((item) => item.grant.featureAssetId === target && item.level <= level) ||
        grants.some(
          (item) =>
            item.grant.key !== grant.key &&
            item.grant.featureAssetId === target &&
            item.level <= level,
        );

      if (!grantedBefore) {
        add(
          [...path, "targetFeatureAssetId"],
          "The class or subclass must grant the target feature at or before this level",
        );
      }
    }
  }

  const classCasts =
    base.definition.spellcasting !== null && base.definition.spellcasting.castingType !== "NONE";
  const { spellcasting } = definition;

  if (spellcasting) {
    if (classCasts) {
      add(["spellcasting"], "The class casts spells itself; the subclass cannot add its own spellcasting");
    }

    if (outOfRange(spellcasting.unlockLevel)) {
      add(["spellcasting", "unlockLevel"], rangeMessage);
    }

    spellcasting.levels.forEach((entry, index) => {
      if (entry.level > maximumLevel) {
        add(["spellcasting", "levels", index, "level"], "Level is above the maximum level of the class");
      }
    });
  }

  if (definition.spellGrants.length > 0 && !classCasts && !spellcasting) {
    add(["spellGrants"], "Granted spells need spellcasting of the class or the subclass");
  }

  return issues;
}

/**
 * Every asset the definition refers to, with the asset types allowed there; the class itself is
 * reported by the service.
 */
export function collectSubclassReferences(definition: SubclassDefinition): AssetReference[] {
  const references: AssetReference[] = [];

  for (const located of listSubclassGrants(definition)) {
    const { grant } = located;
    const path = grantPath(located);

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

  definition.spellGrants.forEach((grant, index) =>
    references.push({
      assetId: grant.spellAssetId,
      path: ["spellGrants", index, "spellAssetId"],
      assetTypes: ["SPELL"],
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
