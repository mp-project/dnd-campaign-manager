import { UUID_PATTERN } from "#core/uuid";
import type { AssetReference } from "#src/modules/assets/index";
import { CONTEXT_VALUE_KEYS } from "#src/modules/features/index";
import {
  FEAT_CHOICE_ASSET_TYPES,
  type FeatChoice,
  type FeatDefinition,
  type FeatFeatureGrant,
  PREREQUISITE_MAX_DEPTH,
  PREREQUISITE_MAX_NODES,
  type PrerequisiteNode,
} from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import { FEAT_CATEGORIES } from "#src/modules/feats/domain/entities/FeatsTable";

export type DefinitionIssue = { path: (string | number)[]; message: string };

export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

/** From this edition on, feats have categories (2024 Player's Handbook). */
export const FEAT_CATEGORY_EDITION_YEAR = 2024;

/** The categories a ruleset of this edition knows; 2014 feats are all `GENERAL`. */
export function featCategoriesFor(editionYear: number): readonly FeatCategory[] {
  return editionYear >= FEAT_CATEGORY_EDITION_YEAR ? FEAT_CATEGORIES : ["GENERAL"];
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

/** Every node of the tree with its path and depth (root: depth 1). */
export function walkPrerequisites<Ref>(
  root: PrerequisiteNode<Ref> | null,
  path: (string | number)[] = ["prerequisites"],
): { node: PrerequisiteNode<Ref>; path: (string | number)[]; depth: number }[] {
  const result: { node: PrerequisiteNode<Ref>; path: (string | number)[]; depth: number }[] = [];
  const visit = (node: PrerequisiteNode<Ref>, at: (string | number)[], depth: number) => {
    result.push({ node, path: at, depth });

    if (node.type === "ALL" || node.type === "ANY") {
      node.children.forEach((child, index) => visit(child, [...at, "children", index], depth + 1));
    } else if (node.type === "NOT") {
      visit(node.child, [...at, "child"], depth + 1);
    }
  };

  if (root) {
    visit(root, path, 1);
  }

  return result;
}

/** Choices on a cycle of `dependsOnChoiceKey`. */
function cyclicChoices(choices: readonly FeatChoice[]): Set<string> {
  const dependsOn = new Map(choices.map((choice) => [choice.key, choice.dependsOnChoiceKey]));
  const cyclic = new Set<string>();

  for (const choice of choices) {
    const seen = new Set<string>([choice.key]);
    let next = choice.dependsOnChoiceKey;

    while (next !== null && next !== undefined) {
      if (seen.has(next)) {
        if (next === choice.key) {
          cyclic.add(choice.key);
        }

        break;
      }

      seen.add(next);
      next = dependsOn.get(next) ?? null;
    }
  }

  return cyclic;
}

/** Features on a cycle of upgrade and replacement targets within the feat. */
function cyclicGrants(grants: readonly FeatFeatureGrant[]): Set<string> {
  const edges = new Map<string, string[]>();

  for (const grant of grants) {
    if (grant.targetFeatureAssetId !== null) {
      edges.set(grant.featureAssetId, [
        ...(edges.get(grant.featureAssetId) ?? []),
        grant.targetFeatureAssetId,
      ]);
    }
  }

  const cyclic = new Set<string>();

  for (const start of edges.keys()) {
    const seen = new Set<string>();
    let frontier = [...(edges.get(start) ?? [])];

    while (frontier.length > 0 && !cyclic.has(start)) {
      const next: string[] = [];

      for (const node of frontier) {
        if (node === start) {
          cyclic.add(start);
        } else if (!seen.has(node)) {
          seen.add(node);
          next.push(...(edges.get(node) ?? []));
        }
      }

      frontier = next;
    }
  }

  return cyclic;
}

/**
 * Rules across the parts of a feat definition that need no database: a bounded prerequisite tree
 * with sensible levels, unique choice keys with known and acyclic dependencies, the choice that
 * makes the feat repeatable, unique grant keys, bindings to known choices and context values, and
 * no cycles of upgrades and replacements. Asset references are checked by the service.
 */
export function validateFeatDefinition(definition: FeatDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  const nodes = walkPrerequisites(definition.prerequisites);

  if (nodes.length > PREREQUISITE_MAX_NODES) {
    add(["prerequisites"], `The prerequisites have more than ${PREREQUISITE_MAX_NODES} nodes`);
  }

  if (nodes.some(({ depth }) => depth > PREREQUISITE_MAX_DEPTH)) {
    add(["prerequisites"], `The prerequisites are nested deeper than ${PREREQUISITE_MAX_DEPTH} levels`);
  }

  const choiceKeys = new Set(definition.choices.map((choice) => choice.key));

  for (const key of duplicates(definition.choices.map((choice) => choice.key))) {
    add(["choices"], `Key '${key}' is used more than once`);
  }

  const cyclic = cyclicChoices(definition.choices);

  definition.choices.forEach((choice, index) => {
    const dependency = choice.dependsOnChoiceKey;

    if (dependency === null) {
      return;
    }

    if (dependency === choice.key) {
      add(["choices", index, "dependsOnChoiceKey"], "A choice cannot depend on itself");
    } else if (!choiceKeys.has(dependency)) {
      add(["choices", index, "dependsOnChoiceKey"], `Unknown choice '${dependency}'`);
    } else if (cyclic.has(choice.key)) {
      add(["choices", index, "dependsOnChoiceKey"], "Choice dependencies form a cycle");
    }
  });

  const repeatabilityKey = definition.repeatability.repeatabilityChoiceKey;

  if (repeatabilityKey !== null) {
    const choice = definition.choices.find((item) => item.key === repeatabilityKey);

    if (!choice) {
      add(["repeatability", "repeatabilityChoiceKey"], `Unknown choice '${repeatabilityKey}'`);
    } else if (choice.minimumSelections < 1) {
      add(
        ["repeatability", "repeatabilityChoiceKey"],
        "The choice that tells occurrences apart must be answered (minimum at least 1)",
      );
    }
  }

  for (const key of duplicates(definition.featureGrants.map((grant) => grant.key))) {
    add(["featureGrants"], `Key '${key}' is used more than once`);
  }

  const cyclicFeatures = cyclicGrants(definition.featureGrants);

  definition.featureGrants.forEach((grant, index) => {
    const grantPath = ["featureGrants", index];

    if (grant.targetFeatureAssetId !== null && cyclicFeatures.has(grant.featureAssetId)) {
      add([...grantPath, "targetFeatureAssetId"], "Upgrades and replacements form a cycle");
    }

    grant.bindings.forEach((binding, bindingIndex) => {
      const bindingPath = [...grantPath, "bindings", bindingIndex];

      if (binding.bindingSource === "CONTEXT" && !CONTEXT_VALUE_KEYS.includes(binding.contextKey ?? "")) {
        add([...bindingPath, "contextKey"], `Unknown context value '${binding.contextKey}'`);
      }

      if (binding.bindingSource === "FEAT_CHOICE" && !choiceKeys.has(binding.choiceKey ?? "")) {
        add([...bindingPath, "choiceKey"], `Unknown choice '${binding.choiceKey}'`);
      }
    });
  });

  return issues;
}

/** Assets the prerequisites name, with the asset types each node allows. */
export function collectPrerequisiteReferences(
  root: PrerequisiteNode | null,
): AssetReference[] {
  return walkPrerequisites(root).flatMap(({ node, path }): AssetReference[] => {
    switch (node.type) {
      case "CLASS":
        return [{ assetId: node.assetId, path: [...path, "assetId"], assetTypes: ["CLASS"] }];
      case "SPECIES":
        return [
          {
            assetId: node.assetId,
            path: [...path, "assetId"],
            assetTypes: ["SPECIES", "SPECIES_VARIANT"],
          },
        ];
      case "FEAT":
        return [{ assetId: node.assetId, path: [...path, "assetId"], assetTypes: ["FEAT"] }];
      default:
        return [];
    }
  });
}

/** Granted and targeted features. */
export function collectGrantReferences(grants: readonly FeatFeatureGrant[]): AssetReference[] {
  return grants.flatMap((grant, index) => [
    {
      assetId: grant.featureAssetId,
      path: ["featureGrants", index, "featureAssetId"],
      assetTypes: ["FEATURE"] as const,
    },
    ...(grant.targetFeatureAssetId
      ? [
          {
            assetId: grant.targetFeatureAssetId,
            path: ["featureGrants", index, "targetFeatureAssetId"],
            assetTypes: ["FEATURE"] as const,
          },
        ]
      : []),
  ]);
}

/** Assets that fixed choice options link to. */
export function collectChoiceReferences(choices: readonly FeatChoice[]): AssetReference[] {
  return choices.flatMap((choice, choiceIndex) =>
    choice.options.flatMap((option, optionIndex) =>
      option.linkedAssetId === null
        ? []
        : [
            {
              assetId: option.linkedAssetId,
              path: ["choices", choiceIndex, "options", optionIndex, "linkedAssetId"],
              assetTypes: FEAT_CHOICE_ASSET_TYPES[choice.choiceType],
            },
          ],
    ),
  );
}

/** Feats the prerequisites name, at any depth; for the cycle check across feats. */
export function prerequisiteFeatIds(root: PrerequisiteNode | null): string[] {
  return walkPrerequisites(root).flatMap(({ node }) => (node.type === "FEAT" ? [node.assetId] : []));
}

/**
 * Bound values that may be asset ids; hidden from players like references. Free text is left out,
 * because it is no asset and must not reach a uuid column.
 */
export function staticBindingValues(grants: readonly FeatFeatureGrant[]): string[] {
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

/** Every asset id the definition shows, for the visibility of player views. */
export function referencedAssetIds(definition: FeatDefinition): string[] {
  return [
    ...collectPrerequisiteReferences(definition.prerequisites),
    ...collectGrantReferences(definition.featureGrants),
    ...collectChoiceReferences(definition.choices),
  ]
    .map((reference) => reference.assetId)
    .concat(staticBindingValues(definition.featureGrants));
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

/** The tree with references to hidden assets set to null; its structure stays. */
export function toPlayerPrerequisites(
  node: PrerequisiteNode | null,
  isVisible: (assetId: string) => boolean,
): PrerequisiteNode<string | null> | null {
  if (node === null) {
    return null;
  }

  switch (node.type) {
    case "ALL":
    case "ANY":
      return {
        type: node.type,
        children: node.children.map(
          (child) => toPlayerPrerequisites(child, isVisible) as PrerequisiteNode<string | null>,
        ),
      };
    case "NOT":
      return {
        type: "NOT",
        child: toPlayerPrerequisites(node.child, isVisible) as PrerequisiteNode<string | null>,
      };
    case "CLASS":
    case "SPECIES":
    case "FEAT":
      return { ...node, assetId: isVisible(node.assetId) ? node.assetId : null };
    default:
      return node;
  }
}

/** Choices without options that link to hidden assets. */
export function toPlayerChoices(
  choices: readonly FeatChoice[],
  isVisible: (assetId: string) => boolean,
): FeatChoice[] {
  return choices.map((choice) => ({
    ...choice,
    options: choice.options.filter(
      (option) => option.linkedAssetId === null || isVisible(option.linkedAssetId),
    ),
  }));
}

/**
 * Grants as a player may see them: grants of hidden features or with hidden targets are left out,
 * bound values pointing to hidden assets are dropped.
 */
export function toPlayerGrants(
  grants: readonly FeatFeatureGrant[],
  isVisible: (assetId: string) => boolean,
): FeatFeatureGrant[] {
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
