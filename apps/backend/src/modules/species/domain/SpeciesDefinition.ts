import { UUID_PATTERN } from "#core/uuid";
import type { AssetReference } from "#src/modules/assets/index";
import { CONTEXT_VALUE_KEYS } from "#src/modules/features/index";
import type {
  SpeciesDefinition,
  SpeciesFeatureGrant,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";

export type DefinitionIssue = { path: (string | number)[]; message: string };

/** Core values the definition parts depend on. */
export type SpeciesSettings = { lifespanMode: "RULESET_DEFAULT" | "SPECIES_SPECIFIC" | "UNSPECIFIED" };

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

/** Unique keys (also against the base species, since a selection names grants by key) and known context values. */
export function validateGrantKeys(
  grants: readonly SpeciesFeatureGrant[],
  path: (string | number)[],
  baseGrants: readonly SpeciesFeatureGrant[] = [],
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (at: (string | number)[], message: string) => issues.push({ path: at, message });
  const baseKeys = new Set(baseGrants.map((grant) => grant.key));

  for (const key of duplicates(grants.map((grant) => grant.key))) {
    add(path, `Key '${key}' is used more than once`);
  }

  grants.forEach((grant, index) => {
    const grantPath = [...path, index];

    if (baseKeys.has(grant.key)) {
      add([...grantPath, "key"], `Key '${grant.key}' is already used by the species`);
    }

    grant.bindings.forEach((binding, bindingIndex) => {
      if (binding.bindingSource === "CONTEXT" && !CONTEXT_VALUE_KEYS.includes(binding.contextKey ?? "")) {
        add(
          [...grantPath, "bindings", bindingIndex, "contextKey"],
          `Unknown context value '${binding.contextKey}'`,
        );
      }
    });
  });

  return issues;
}

/**
 * Rules of feature grants that need no database: those of `validateGrantKeys`, and upgrades and
 * replacements that target a feature granted here or by the base species, at the same level or
 * earlier, without cycles.
 */
export function validateFeatureGrants(
  grants: readonly SpeciesFeatureGrant[],
  path: (string | number)[],
  baseGrants: readonly SpeciesFeatureGrant[] = [],
): DefinitionIssue[] {
  const issues = validateGrantKeys(grants, path, baseGrants);
  const add = (at: (string | number)[], message: string) => issues.push({ path: at, message });
  const all = [...baseGrants, ...grants];

  grants.forEach((grant, index) => {
    const grantPath = [...path, index];

    if (grant.targetFeatureAssetId === null) {
      return;
    }

    const targets = all.filter(
      (other) => other !== grant && other.featureAssetId === grant.targetFeatureAssetId,
    );

    if (targets.length === 0) {
      add(
        [...grantPath, "targetFeatureAssetId"],
        "The target must be a feature granted by the species or this variant",
      );
    } else if (targets.every((target) => target.minimumCharacterLevel > grant.minimumCharacterLevel)) {
      add(
        [...grantPath, "minimumCharacterLevel"],
        "An upgrade or replacement cannot apply before its target",
      );
    }
  });

  const cyclic = findCyclicFeatures(all);

  grants.forEach((grant, index) => {
    if (grant.targetFeatureAssetId !== null && cyclic.has(grant.featureAssetId)) {
      add([...path, index, "targetFeatureAssetId"], "Upgrades and replacements form a cycle");
    }
  });

  return issues;
}

/** Features on a cycle of upgrade and replacement targets (A replaces B, B replaces A). */
function findCyclicFeatures(grants: readonly SpeciesFeatureGrant[]): Set<string> {
  const edges = new Map<string, Set<string>>();

  for (const grant of grants) {
    if (grant.targetFeatureAssetId !== null) {
      const targets = edges.get(grant.featureAssetId) ?? new Set<string>();

      targets.add(grant.targetFeatureAssetId);
      edges.set(grant.featureAssetId, targets);
    }
  }

  const cyclic = new Set<string>();

  for (const start of edges.keys()) {
    const seen = new Set<string>();
    let frontier = [...(edges.get(start) ?? [])];

    while (frontier.length > 0) {
      const next: string[] = [];

      for (const node of frontier) {
        if (node === start) {
          cyclic.add(start);
          break;
        }

        if (!seen.has(node)) {
          seen.add(node);
          next.push(...(edges.get(node) ?? []));
        }
      }

      if (cyclic.has(start)) {
        break;
      }

      frontier = next;
    }
  }

  return cyclic;
}

/**
 * Rules across the parts of a species definition that need no database: unique sizes with at most
 * one default, unique movement modes with exactly one base walking speed, lifespan values that fit
 * the lifespan mode, unique keys and the feature grants. Asset references and feature parameters
 * are checked by the service.
 */
export function validateSpeciesDefinition(
  settings: SpeciesSettings,
  definition: SpeciesDefinition,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  for (const size of duplicates(definition.sizeOptions.map((option) => option.size))) {
    add(["sizeOptions"], `Size ${size} is offered more than once`);
  }

  if (definition.sizeOptions.filter((option) => option.isDefault).length > 1) {
    add(["sizeOptions"], "At most one size is the default");
  }

  for (const mode of duplicates(definition.movementModes.map((movement) => movement.mode))) {
    add(["movementModes"], `Movement mode ${mode} is listed more than once`);
  }

  const base = definition.movementModes.filter((movement) => movement.isBase);

  if (base.length !== 1 || base[0]?.mode !== "WALK" || !base[0].distanceFeet) {
    add(["movementModes"], "A species needs exactly one base speed, a positive walking speed");
  }

  const lifespans = [definition.ageProfile?.typicalLifespan, definition.ageProfile?.maximumLifespan];

  if (settings.lifespanMode === "SPECIES_SPECIFIC") {
    if (lifespans.every((value) => value === null || value === undefined)) {
      add(["ageProfile"], "A species-specific lifespan needs a typical or maximum lifespan");
    }
  } else if (lifespans.some((value) => value !== null && value !== undefined)) {
    add(["ageProfile"], `Lifespans are only set with SPECIES_SPECIFIC, not ${settings.lifespanMode}`);
  }

  for (const key of duplicates(definition.textSections.map((section) => section.key))) {
    add(["textSections"], `Key '${key}' is used more than once`);
  }

  for (const code of duplicates(definition.variantGroups.map((group) => group.code))) {
    add(["variantGroups"], `Code '${code}' is used more than once`);
  }

  issues.push(...validateFeatureGrants(definition.featureGrants, ["featureGrants"]));

  return issues;
}

/** Another variant of the same species, for keys that must be unique across all of them. */
export type SiblingVariant = { code: string; featureGrants: readonly SpeciesFeatureGrant[] };

/**
 * Rules of a variant against its species: the group exists, grants fit those of the species, and
 * grant keys are unique across the species and all its variants, since a selection names the
 * choices of a grant by its key alone and may combine variants of several groups.
 */
export function validateVariantDefinition(
  variant: { variantGroupCode: string; featureGrants: readonly SpeciesFeatureGrant[] },
  species: Pick<SpeciesDefinition, "variantGroups" | "featureGrants">,
  siblings: readonly SiblingVariant[] = [],
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  if (!species.variantGroups.some((group) => group.code === variant.variantGroupCode)) {
    issues.push({
      path: ["variantGroupCode"],
      message: `The species has no variant group '${variant.variantGroupCode}'`,
    });
  }

  issues.push(...validateFeatureGrants(variant.featureGrants, ["featureGrants"], species.featureGrants));

  const usedBy = new Map<string, string>();

  for (const sibling of siblings) {
    for (const grant of sibling.featureGrants) {
      usedBy.set(grant.key, sibling.code);
    }
  }

  variant.featureGrants.forEach((grant, index) => {
    const other = usedBy.get(grant.key);

    if (other !== undefined) {
      issues.push({
        path: ["featureGrants", index, "key"],
        message: `Key '${grant.key}' is already used by variant '${other}'`,
      });
    }
  });

  return issues;
}

/**
 * Grants as a player may see them: grants of hidden features or with hidden targets are left out,
 * bound values pointing to hidden assets are dropped. The one filter for every player view and the
 * player's selection.
 */
export function toPlayerGrants(
  grants: readonly SpeciesFeatureGrant[],
  isVisible: (assetId: string) => boolean,
): SpeciesFeatureGrant[] {
  const hidden = (assetId: string | null) => assetId !== null && !isVisible(assetId);

  return grants
    .filter((grant) => !hidden(grant.featureAssetId) && !hidden(grant.targetFeatureAssetId))
    .map((grant) => ({
      ...grant,
      bindings: grant.bindings.filter(
        (binding) =>
          !(
            binding.bindingSource === "STATIC" &&
            typeof binding.staticValue === "string" &&
            UUID_PATTERN.test(binding.staticValue) &&
            hidden(binding.staticValue)
          ),
      ),
    }));
}

/** Every feature the grants refer to, granted or targeted. */
export function collectGrantReferences(
  grants: readonly SpeciesFeatureGrant[],
  path: (string | number)[] = ["featureGrants"],
): AssetReference[] {
  return grants.flatMap((grant, index) => [
    { assetId: grant.featureAssetId, path: [...path, index, "featureAssetId"], assetTypes: ["FEATURE"] },
    ...(grant.targetFeatureAssetId
      ? [
          {
            assetId: grant.targetFeatureAssetId,
            path: [...path, index, "targetFeatureAssetId"],
            assetTypes: ["FEATURE"] as const,
          },
        ]
      : []),
  ]);
}

/**
 * Bound values that may be asset ids; hidden from players like references. Free text is left out,
 * because it is no asset and must not reach a uuid column.
 */
export function staticBindingValues(grants: readonly SpeciesFeatureGrant[]): string[] {
  return grants.flatMap((grant) =>
    grant.bindings.flatMap((binding) =>
      binding.bindingSource === "STATIC" &&
      typeof binding.staticValue === "string" &&
      UUID_PATTERN.test(binding.staticValue)
        ? [binding.staticValue]
        : [],
    ),
  );
}
