import { UUID_PATTERN } from "#core/uuid";
import type { AssetReference } from "#src/modules/assets/index";
import {
  type BackgroundDefinition,
  type BackgroundFeatureGrant,
  type EquipmentOption,
  type FeatGrant,
  type ProficiencyGrant,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { BACKGROUND_CUSTOMIZATION_MODES } from "#src/modules/backgrounds/domain/entities/BackgroundsTable";
import { FEAT_CATEGORIES, featCategoryProperty } from "#src/modules/feats/index";
import { CONTEXT_VALUE_KEYS, FEATURE_PROPERTIES } from "#src/modules/features/index";
import {
  itemCategoryEnum,
  itemCategoryProperty,
  itemToolCategoryEnum,
  toolCategoryProperty,
} from "#src/modules/items/index";

export type DefinitionIssue = { path: (string | number)[]; message: string };

export type CustomizationMode = (typeof BACKGROUND_CUSTOMIZATION_MODES)[number];

/**
 * From this edition on, backgrounds raise ability scores (+3 over three abilities) and grant an
 * origin feat (2024 Player's Handbook); the 2014 rule to customize a background ends with it.
 */
export const BACKGROUND_2024_EDITION_YEAR = 2024;

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

/** Features on a cycle of upgrade and replacement targets within the background. */
function cyclicGrants(grants: readonly BackgroundFeatureGrant[]): Set<string> {
  const edges = new Map<string, string[]>();

  for (const grant of grants) {
    if (grant.targetFeatureAssetId !== null) {
      edges.set(grant.featureAssetId, [...(edges.get(grant.featureAssetId) ?? []), grant.targetFeatureAssetId]);
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
 * Rules across the parts of a background definition that need no database: unique keys per part
 * (grant keys across proficiency, feat and feature grants, because a selection names them), unique
 * option codes, bindings to known context values and no cycles of upgrades and replacements. The
 * edition rules and asset references are checked by the service.
 */
export function validateBackgroundDefinition(definition: BackgroundDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  for (const key of duplicates(definition.sections.map((section) => section.key))) {
    add(["sections"], `Key '${key}' is used more than once`);
  }

  const grantKeys = [
    ...definition.proficiencyGrants.map((grant) => grant.key),
    ...definition.featGrants.map((grant) => grant.key),
    ...definition.featureGrants.map((grant) => grant.key),
  ];

  for (const key of duplicates(grantKeys)) {
    add(["proficiencyGrants"], `Grant key '${key}' is used more than once`);
  }

  for (const featId of duplicates(definition.featGrants.flatMap((grant) => (grant.featAssetId ? [grant.featAssetId] : [])))) {
    add(["featGrants"], `Feat '${featId}' is granted more than once`);
  }

  for (const code of duplicates(definition.equipmentOptions.map((option) => option.code))) {
    add(["equipmentOptions"], `Code '${code}' is used more than once`);
  }

  for (const key of duplicates(definition.promptTables.map((table) => table.key))) {
    add(["promptTables"], `Key '${key}' is used more than once`);
  }

  const cyclic = cyclicGrants(definition.featureGrants);

  definition.featureGrants.forEach((grant, index) => {
    const path = ["featureGrants", index];

    if (grant.targetFeatureAssetId !== null && cyclic.has(grant.featureAssetId)) {
      add([...path, "targetFeatureAssetId"], "Upgrades and replacements form a cycle");
    }

    grant.bindings.forEach((binding, bindingIndex) => {
      if (binding.bindingSource === "CONTEXT" && !CONTEXT_VALUE_KEYS.includes(binding.contextKey ?? "")) {
        add([...path, "bindings", bindingIndex, "contextKey"], `Unknown context value '${binding.contextKey}'`);
      }
    });
  });

  return issues;
}

/**
 * Rules of the edition the background is used with. `editions` holds the edition years of its
 * rulesets: the campaign ruleset of a custom background, every ruleset of a global one; null for a
 * neutral global background, which is used with every edition. From 2024 on, ability scores are
 * distributed (`CHOOSE_2024`), feat choices offer origin feats and a background is not
 * customized; before 2024 there is no `CHOOSE_2024`. That a fixed feat is an origin feat is a
 * `forbids` of its reference (`collectRuleReferences`), so it also holds when the feat changes.
 */
export function validateBackgroundEdition(
  input: {
    customizationMode: CustomizationMode;
    definition: BackgroundDefinition;
  },
  editions: readonly number[] | null,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const any2024 = editions === null || editions.some((year) => year >= BACKGROUND_2024_EDITION_YEAR);
  const anyOlder = editions === null || editions.some((year) => year < BACKGROUND_2024_EDITION_YEAR);
  const scope = editions === null ? "a neutral background is used with every edition" : null;
  const message = (text: string) => (scope ? `${text}; ${scope}` : text);

  if (input.definition.abilityRule.mode === "CHOOSE_2024" && anyOlder) {
    issues.push({
      path: ["abilityRule", "mode"],
      message: message(`Distributed ability increases exist from the ${BACKGROUND_2024_EDITION_YEAR} rules on`),
    });
  }

  if (input.definition.abilityRule.mode !== "CHOOSE_2024" && editions !== null && editions.length > 0 && !anyOlder) {
    issues.push({
      path: ["abilityRule", "mode"],
      message: `Backgrounds of the ${BACKGROUND_2024_EDITION_YEAR} rules distribute ability increases (CHOOSE_2024)`,
    });
  }

  if (input.customizationMode === "RULESET_CUSTOMIZABLE" && any2024) {
    issues.push({
      path: ["customizationMode"],
      message: message(`Customizing a background is a rule before ${BACKGROUND_2024_EDITION_YEAR}`),
    });
  }

  if (any2024) {
    input.definition.featGrants.forEach((grant, index) => {
      if (grant.optionFilter && grant.optionFilter.categories.some((category) => category !== "ORIGIN")) {
        issues.push({
          path: ["featGrants", index, "optionFilter", "categories"],
          message: message(`Backgrounds of the ${BACKGROUND_2024_EDITION_YEAR} rules offer origin feats only`),
        });
      }
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** Tool items the proficiency grants name. */
export function collectProficiencyReferences(grants: readonly ProficiencyGrant[]): AssetReference[] {
  return grants.flatMap((grant, grantIndex) =>
    grant.options.flatMap((option, optionIndex) =>
      option.assetId === null
        ? []
        : [
            {
              assetId: option.assetId,
              path: ["proficiencyGrants", grantIndex, "options", optionIndex, "assetId"],
              assetTypes: ["ITEM"] as const,
            },
          ],
    ),
  );
}

/** Granted feats and feats a choice is limited to. */
export function collectFeatReferences(grants: readonly FeatGrant[]): AssetReference[] {
  return grants.flatMap((grant, grantIndex) => [
    ...(grant.featAssetId === null
      ? []
      : [{ assetId: grant.featAssetId, path: ["featGrants", grantIndex, "featAssetId"], assetTypes: ["FEAT"] as const }]),
    ...(grant.optionFilter?.featAssetIds ?? []).map((assetId, index) => ({
      assetId,
      path: ["featGrants", grantIndex, "optionFilter", "featAssetIds", index],
      assetTypes: ["FEAT"] as const,
    })),
  ]);
}

/** Granted and targeted features. */
export function collectGrantReferences(grants: readonly BackgroundFeatureGrant[]): AssetReference[] {
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

/** Fixed items of the equipment and items a choice is limited to. */
export function collectEquipmentReferences(options: readonly EquipmentOption[]): AssetReference[] {
  return options.flatMap((option, optionIndex) =>
    option.entries.flatMap((entry, entryIndex) => {
      const path = ["equipmentOptions", optionIndex, "entries", entryIndex];

      return [
        ...(entry.itemAssetId === null
          ? []
          : [{ assetId: entry.itemAssetId, path: [...path, "itemAssetId"], assetTypes: ["ITEM"] as const }]),
        ...(entry.choiceFilter?.itemAssetIds ?? []).map((assetId, index) => ({
          assetId,
          path: [...path, "choiceFilter", "itemAssetIds", index],
          assetTypes: ["ITEM"] as const,
        })),
      ];
    }),
  );
}

/** Every reference of the definition with the asset types each place allows. */
export function collectDefinitionReferences(definition: BackgroundDefinition): AssetReference[] {
  return [
    ...collectProficiencyReferences(definition.proficiencyGrants),
    ...collectFeatReferences(definition.featGrants),
    ...collectGrantReferences(definition.featureGrants),
    ...collectEquipmentReferences(definition.equipmentOptions),
  ];
}

/** A reference with the properties its target must not have (see `ContentReference.forbids`). */
export type RuleReference = AssetReference & { forbids: string[] };

const otherFeatCategories = (allowed: readonly string[]) =>
  FEAT_CATEGORIES.filter((category) => !allowed.includes(category)).map((category) => featCategoryProperty(category).code);

const otherItemCategories = (allowed: readonly string[]) =>
  itemCategoryEnum.enumValues
    .filter((category) => !allowed.includes(category))
    .map((category) => itemCategoryProperty(category).code);

const otherToolCategories = (allowed: readonly string[]) =>
  itemToolCategoryEnum.enumValues
    .filter((category) => !allowed.includes(category))
    .map((category) => toolCategoryProperty(category).code);

/**
 * Every reference with what its target must not be, so the rules also hold when the target changes
 * later (the kernel checks `forbids` against the target's properties): tool proficiencies name
 * tools; feats of a choice have one of its categories, from 2024 on origin feats only; granted
 * features scale by character level, never by class level, and from 2024 on raise no ability scores
 * (the ability rule does); items of a choice fit its categories. `uses2024` says whether the
 * background is used with a ruleset of the 2024 rules or later.
 */
export function collectRuleReferences(definition: BackgroundDefinition, uses2024: boolean): RuleReference[] {
  const featAllowed = (categories: readonly string[]) =>
    uses2024 ? categories.filter((category) => category === "ORIGIN") : categories;
  const featureForbids = [
    FEATURE_PROPERTIES.usesClassLevel.code,
    ...(uses2024 ? [FEATURE_PROPERTIES.raisesAbilityScore.code] : []),
  ];

  const proficiencies = collectProficiencyReferences(definition.proficiencyGrants).map((reference) => ({
    ...reference,
    forbids: otherItemCategories(["TOOL"]),
  }));
  const feats = collectFeatReferences(definition.featGrants).map((reference) => {
    const grant = definition.featGrants[reference.path[1] as number];

    return {
      ...reference,
      forbids: otherFeatCategories(featAllowed(grant?.optionFilter?.categories ?? FEAT_CATEGORIES)),
    };
  });
  const features = collectGrantReferences(definition.featureGrants).map((reference) => ({
    ...reference,
    // The rules hold for granted features, not for the targets of upgrades.
    forbids: reference.path.at(-1) === "featureAssetId" ? featureForbids : [],
  }));
  const equipment = collectEquipmentReferences(definition.equipmentOptions).map((reference) => {
    const option = definition.equipmentOptions[reference.path[1] as number];
    const filter = option?.entries[reference.path[3] as number]?.choiceFilter;

    if (!filter || reference.path.at(-1) === "itemAssetId") {
      return { ...reference, forbids: [] };
    }

    return {
      ...reference,
      forbids: [
        ...(filter.categories.length > 0 ? otherItemCategories(filter.categories) : []),
        ...(filter.toolCategories.length > 0
          ? [...otherItemCategories(["TOOL"]), ...otherToolCategories(filter.toolCategories)]
          : []),
      ],
    };
  });

  return [...proficiencies, ...feats, ...features, ...equipment];
}

const isBoundAssetId = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

/**
 * Bound values that may be asset ids; hidden from players like references. Free text is left out,
 * because it is no asset.
 */
export function staticBindingValues(grants: readonly BackgroundFeatureGrant[]): string[] {
  return grants.flatMap((grant) =>
    grant.bindings.flatMap((binding) =>
      binding.bindingSource === "STATIC" && isBoundAssetId(binding.staticValue) ? [binding.staticValue] : [],
    ),
  );
}

/** Every asset id the definition shows, for the visibility of player views. */
export function referencedAssetIds(definition: BackgroundDefinition): string[] {
  return collectDefinitionReferences(definition)
    .map((reference) => reference.assetId)
    .concat(staticBindingValues(definition.featureGrants));
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

/**
 * The definition as a player sees it, as if hidden content did not exist: no GM-only sections, no
 * options, feats or grants of assets the player may not see, and no bound values that point to
 * hidden assets. A fixed feat grant of a hidden feat is left out as a whole, like a feature grant.
 * A proficiency grant whose options are all hidden is left out too, because no options would mean
 * "any of the type". An equipment option is a package: if one of its entries is hidden, the whole
 * option is left out, so a player never previews a package with fewer items than it has.
 */
export function toPlayerDefinition(
  definition: BackgroundDefinition,
  isVisible: (assetId: string) => boolean,
): BackgroundDefinition {
  const hidden = (assetId: string | null) => assetId !== null && !isVisible(assetId);
  // A choice limited to named assets that are all hidden offers nothing; an empty list would mean
  // "no limit", so the choice is left out instead.
  const onlyHidden = (ids: readonly string[] | undefined) =>
    ids !== undefined && ids.length > 0 && ids.every((id) => !isVisible(id));

  return {
    sections: definition.sections.filter((section) => !section.gmOnly),
    abilityRule: definition.abilityRule,
    proficiencyGrants: definition.proficiencyGrants
      .filter((grant) => grant.options.length === 0 || grant.options.some((option) => !hidden(option.assetId)))
      .map((grant) => ({
        ...grant,
        options: grant.options.filter((option) => !hidden(option.assetId)),
      })),
    featGrants: definition.featGrants
      .filter((grant) => !hidden(grant.featAssetId) && !onlyHidden(grant.optionFilter?.featAssetIds))
      .map((grant) => ({
        ...grant,
        optionFilter: grant.optionFilter && {
          ...grant.optionFilter,
          featAssetIds: grant.optionFilter.featAssetIds.filter((id) => isVisible(id)),
        },
      })),
    featureGrants: definition.featureGrants
      .filter((grant) => !hidden(grant.featureAssetId) && !hidden(grant.targetFeatureAssetId))
      .map((grant) => ({
        ...grant,
        bindings: grant.bindings.filter(
          (binding) =>
            !(binding.bindingSource === "STATIC" && isBoundAssetId(binding.staticValue) && hidden(binding.staticValue)),
        ),
      })),
    equipmentOptions: definition.equipmentOptions
      .filter((option) =>
        option.entries.every((entry) => !hidden(entry.itemAssetId) && !onlyHidden(entry.choiceFilter?.itemAssetIds)),
      )
      .map((option) => ({
        ...option,
        entries: option.entries.map((entry) => ({
          ...entry,
          choiceFilter: entry.choiceFilter && {
            ...entry.choiceFilter,
            itemAssetIds: entry.choiceFilter.itemAssetIds.filter((id) => isVisible(id)),
          },
        })),
      })),
    promptTables: definition.promptTables,
  };
}
