import type {
  SpeciesDefinition,
  SpeciesFeatureGrant,
  SpeciesSize,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import type { DefinitionIssue } from "#src/modules/species/domain/SpeciesDefinition";

/**
 * Pure rules of choosing a species for a character: which options there are, whether a selection
 * is complete and which feature grants apply at a character level. Nothing here touches an actor;
 * the character modules store the selection themselves.
 */

/** A variant as offered for a selection; `selectable` is false for archived variants still in use. */
export type OfferedVariant = {
  variantId: string;
  assetId: string;
  code: string;
  name: string;
  summary: string | null;
  variantGroupCode: string;
  displayOrder: number;
  selectable: boolean;
  featureGrants: readonly SpeciesFeatureGrant[];
};

export type SpeciesSelection = {
  variantAssetIds: readonly string[];
  size?: SpeciesSize | undefined;
  characterLevel: number;
  /** Choices of granted features, by grant key and the feature's choice key. */
  choices: readonly { grantKey: string; choiceKey: string; values: readonly string[] }[];
};

export type GrantSource = "SPECIES" | "SPECIES_VARIANT";

export type SourcedGrant = {
  sourceType: GrantSource;
  sourceAssetId: string;
  grant: SpeciesFeatureGrant;
};

/**
 * `LOCKED`: the character level is too low yet. `REPLACED`: another applying grant replaces the
 * feature. `UPGRADED`: another one upgrades it; it keeps its choices and resources, but not its
 * effects.
 */
export type GrantStatus = "APPLIED" | "UPGRADED" | "REPLACED" | "LOCKED";

const byDisplayOrder = <T extends { displayOrder: number }>(items: readonly T[]) =>
  [...items].sort((left, right) => left.displayOrder - right.displayOrder);

/** The size taken without a choice: the default, or the only one offered. */
export function defaultSize(definition: Pick<SpeciesDefinition, "sizeOptions">): SpeciesSize | null {
  const fallback = definition.sizeOptions.length === 1 ? definition.sizeOptions[0] : undefined;

  return (definition.sizeOptions.find((option) => option.isDefault) ?? fallback)?.size ?? null;
}

/** What a character picks from: sizes and the variant groups with their variants. */
export function getCreationOptions(
  definition: Pick<SpeciesDefinition, "sizeOptions" | "movementModes" | "variantGroups">,
  variants: readonly OfferedVariant[],
) {
  return {
    sizeOptions: byDisplayOrder(definition.sizeOptions),
    defaultSize: defaultSize(definition),
    movementModes: definition.movementModes,
    variantGroups: byDisplayOrder(definition.variantGroups).map((group) => {
      const members = byDisplayOrder(
        variants.filter((variant) => variant.variantGroupCode === group.code),
      );

      return {
        ...group,
        /** Whether enough variants can be chosen to complete the group. */
        satisfiable: members.filter((variant) => variant.selectable).length >= group.minimumSelections,
        variants: members.map((variant) => ({
          variantId: variant.variantId,
          assetId: variant.assetId,
          code: variant.code,
          name: variant.name,
          summary: variant.summary,
          displayOrder: variant.displayOrder,
          selectable: variant.selectable,
        })),
      };
    }),
  };
}

/** The grants of the species and the chosen variants, sorted by level and display order. */
export function collectSelectedGrants(
  species: { assetId: string; featureGrants: readonly SpeciesFeatureGrant[] },
  chosen: readonly OfferedVariant[],
): SourcedGrant[] {
  const sourced: SourcedGrant[] = [
    ...species.featureGrants.map((grant) => ({
      sourceType: "SPECIES" as const,
      sourceAssetId: species.assetId,
      grant,
    })),
    ...chosen.flatMap((variant) =>
      variant.featureGrants.map((grant) => ({
        sourceType: "SPECIES_VARIANT" as const,
        sourceAssetId: variant.assetId,
        grant,
      })),
    ),
  ];

  return sourced
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        left.item.grant.minimumCharacterLevel - right.item.grant.minimumCharacterLevel ||
        left.item.grant.displayOrder - right.item.grant.displayOrder ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

/**
 * Checks a selection against the species: an offered size (or a default), known and selectable
 * variants, each group between its minimum and maximum, and choices only for grants that apply.
 */
export function validateSpeciesSelection(
  species: { assetId: string; definition: SpeciesDefinition },
  variants: readonly OfferedVariant[],
  selection: SpeciesSelection,
): { issues: DefinitionIssue[]; size: SpeciesSize | null; chosen: OfferedVariant[] } {
  const issues: DefinitionIssue[] = [];
  const { definition } = species;
  const offered = new Map(variants.map((variant) => [variant.assetId, variant]));
  const chosen: OfferedVariant[] = [];
  let size: SpeciesSize | null = null;

  if (selection.size !== undefined) {
    if (definition.sizeOptions.some((option) => option.size === selection.size)) {
      size = selection.size;
    } else {
      issues.push({ path: ["size"], message: `The species is not offered in size ${selection.size}` });
    }
  } else {
    size = defaultSize(definition);

    if (size === null) {
      issues.push({ path: ["size"], message: "The species needs a choice of size" });
    }
  }

  const seen = new Set<string>();

  selection.variantAssetIds.forEach((assetId, index) => {
    const variant = offered.get(assetId);

    if (seen.has(assetId)) {
      issues.push({ path: ["variantAssetIds", index], message: "A variant is chosen more than once" });
      return;
    }

    seen.add(assetId);

    if (!variant) {
      issues.push({ path: ["variantAssetIds", index], message: "Not a variant of this species" });
    } else if (!variant.selectable) {
      issues.push({ path: ["variantAssetIds", index], message: "Only active variants can be chosen" });
    } else {
      chosen.push(variant);
    }
  });

  const groupCodes = new Set(definition.variantGroups.map((group) => group.code));

  for (const variant of chosen) {
    if (!groupCodes.has(variant.variantGroupCode)) {
      issues.push({ path: ["variantAssetIds"], message: `Variant '${variant.code}' has no group` });
    }
  }

  for (const group of definition.variantGroups) {
    const count = chosen.filter((variant) => variant.variantGroupCode === group.code).length;

    if (count < group.minimumSelections) {
      issues.push({
        path: ["variantAssetIds"],
        message: `Group '${group.code}' needs at least ${group.minimumSelections} variants`,
      });
    }

    if (count > group.maximumSelections) {
      issues.push({
        path: ["variantAssetIds"],
        message: `Group '${group.code}' allows at most ${group.maximumSelections} variants`,
      });
    }
  }

  const selected = collectSelectedGrants(
    { assetId: species.assetId, featureGrants: definition.featureGrants },
    chosen,
  );
  const keyCounts = new Map<string, number>();

  for (const { grant } of selected) {
    keyCounts.set(grant.key, (keyCounts.get(grant.key) ?? 0) + 1);
  }

  // Keys are unique across a species and its variants when written; this guards older data, where
  // one choice would otherwise be handed to two features.
  for (const [key, count] of keyCounts) {
    if (count > 1) {
      issues.push({
        path: ["variantAssetIds"],
        message: `Grant key '${key}' is used more than once by the chosen variants`,
      });
    }
  }

  const applying = new Set(
    selected
      .filter(({ grant }) => grant.minimumCharacterLevel <= selection.characterLevel)
      .map(({ grant }) => grant.key),
  );
  const answered = new Set<string>();

  selection.choices.forEach((choice, index) => {
    const id = `${choice.grantKey}.${choice.choiceKey}`;

    if (!applying.has(choice.grantKey)) {
      issues.push({
        path: ["choices", index, "grantKey"],
        message: `No grant '${choice.grantKey}' applies at this level`,
      });
    }

    if (answered.has(id)) {
      issues.push({ path: ["choices", index], message: "A choice is answered more than once" });
    }

    answered.add(id);
  });

  return { issues, size, chosen };
}

/**
 * Status of each grant at the character level. A replacement drops its target, an upgrade keeps
 * the target's choices and resources but not its effects; replacing is the stronger of the two.
 * Only grants that apply themselves change others.
 */
export function applyGrantOperations(
  grants: readonly SourcedGrant[],
  characterLevel: number,
): (SourcedGrant & { status: GrantStatus })[] {
  const applying = grants.filter(({ grant }) => grant.minimumCharacterLevel <= characterLevel);
  const superseded = new Map<SourcedGrant, "REPLACED" | "UPGRADED">();

  for (const item of applying) {
    const { grant } = item;

    if (grant.operation === "GRANT" || grant.targetFeatureAssetId === null) {
      continue;
    }

    for (const target of applying) {
      if (target === item || target.grant.featureAssetId !== grant.targetFeatureAssetId) {
        continue;
      }

      if (grant.operation === "REPLACE" || superseded.get(target) !== "REPLACED") {
        superseded.set(target, grant.operation === "REPLACE" ? "REPLACED" : "UPGRADED");
      }
    }
  }

  return grants.map((item) => ({
    ...item,
    status:
      item.grant.minimumCharacterLevel > characterLevel ? "LOCKED" : (superseded.get(item) ?? "APPLIED"),
  }));
}
