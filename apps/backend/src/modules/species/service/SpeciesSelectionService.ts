import type { ContentView, ContentViewer } from "#core/content/viewer";
import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import {
  type ActorSnapshot,
  type FeaturesService,
  type ResolvedFeatureGraph,
  toResolvedFeatureResponse,
} from "#src/modules/features/index";
import type { SpeciesSelectionDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ResponseSpeciesSelectionDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesFeatureGrant } from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import type {
  SpeciesVariantWithAsset,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import {
  applyGrantOperations,
  collectSelectedGrants,
  getCreationOptions,
  type OfferedVariant,
  validateSpeciesSelection,
} from "#src/modules/species/domain/SpeciesSelection";
import { toPlayerGrants } from "#src/modules/species/domain/SpeciesDefinition";
import {
  readSpeciesDefinition,
  tryParseVariantGrants,
} from "#src/modules/species/history/TrackedSpecies";

/** Context values a CONTEXT binding may take, from the selection and the actor snapshot. */
function contextValue(key: string, actor: ActorSnapshot): number | undefined {
  if (key === "level.character" || key === "level.source") {
    return actor.characterLevel;
  }

  if (key === "proficiencyBonus") {
    return actor.proficiencyBonus;
  }

  const ability = /^ability\.([a-z]{3})(\.modifier)?$/.exec(key);

  if (ability) {
    const score = actor.abilities?.[ability[1] as keyof NonNullable<ActorSnapshot["abilities"]>];

    if (score === undefined) {
      return undefined;
    }

    return ability[2] ? Math.floor((score - 10) / 2) : score;
  }

  return undefined;
}

/**
 * Creation options and the resolution of a character's species selection, for the catalog routes
 * and the character modules (`validateSpeciesSelection`, `resolveSpeciesSelection`). Changes no
 * actor: the character modules store the selection in their own transaction.
 *
 * `isVisible` decides what the viewer sees. Players get a preview of the species as if hidden
 * grants did not exist: they are left out before upgrades and replacements are applied, and a
 * choice for a hidden grant is refused like one for an unknown grant, so nothing about them leaks.
 * The character modules resolve with everything visible.
 */
export class SpeciesSelectionService {
  constructor(private readonly features: FeaturesService) {}

  /**
   * Variants as offered for a selection, with grants a player may not see left out. Grants already
   * parsed by the caller are used as they are. Variants whose stored grants no longer parse are not
   * offered; `validate` reports them.
   */
  offeredVariants(
    variants: readonly (SpeciesVariantWithAsset & { featureGrants?: readonly SpeciesFeatureGrant[] })[],
    isVisible: (assetId: string) => boolean,
  ): OfferedVariant[] {
    return variants.flatMap(({ variant, asset, featureGrants }) => {
      const grants = featureGrants ?? tryParseVariantGrants(variant);

      return grants === null
        ? []
        : [
            {
              variantId: variant.id,
              assetId: asset.id,
              code: variant.code,
              name: asset.title,
              summary: asset.summary,
              variantGroupCode: variant.variantGroupCode,
              displayOrder: variant.displayOrder,
              selectable: asset.status === "ACTIVE",
              featureGrants: toPlayerGrants(grants, isVisible),
            },
          ];
    });
  }

  getCreationOptions(found: SpeciesWithAsset, offered: readonly OfferedVariant[]) {
    const definition = readSpeciesDefinition(found.species);

    return {
      selectable: found.asset.status === "ACTIVE",
      creatureType: found.species.creatureType,
      lifespanMode: found.species.lifespanMode,
      ageProfile: definition.ageProfile,
      physicalProfile: definition.physicalProfile,
      ...getCreationOptions(definition, offered),
    };
  }

  /**
   * Checks the selection and returns its issues; an empty list means the character may take it.
   * Only active species can be chosen anew. The returned definition carries the grants the viewer
   * sees (`isVisible`, all by default), the same ones the selection was checked against.
   */
  validateSpeciesSelection(
    found: SpeciesWithAsset,
    offered: readonly OfferedVariant[],
    selection: SpeciesSelectionDto,
    isVisible: (assetId: string) => boolean = () => true,
  ) {
    const stored = readSpeciesDefinition(found.species);
    const definition = { ...stored, featureGrants: toPlayerGrants(stored.featureGrants, isVisible) };
    const result = validateSpeciesSelection(
      { assetId: found.asset.id, definition },
      offered,
      selection,
    );

    if (found.asset.status !== "ACTIVE") {
      result.issues.unshift({ path: [], message: "Only active species can be chosen" });
    }

    return { ...result, definition };
  }

  /**
   * Resolves a valid selection at the character level: which grants apply, with upgrades and
   * replacements, each granted feature with its parameters and choices bound, and the passive
   * effects added up. An invalid selection is a conflict (409) listing every issue; a choice that
   * does not fit its feature is a 400 from the features module. Callers inside a transaction pass
   * its handle as `db`.
   */
  async resolveSpeciesSelection(
    found: SpeciesWithAsset,
    input: {
      viewer: ContentViewer;
      view: ContentView;
      visibleAssetIds: ReadonlySet<string>;
      isVisible: (assetId: string) => boolean;
      offered: readonly OfferedVariant[];
      selection: SpeciesSelectionDto;
      db?: AppDatabase | undefined;
    },
  ): Promise<Omit<ResponseSpeciesSelectionDto, "speciesId" | "assetId" | "view">> {
    const { selection } = input;
    const db = input.db ?? this.features.db;
    const { issues, size, chosen, definition } = this.validateSpeciesSelection(
      found,
      input.offered,
      selection,
      input.isVisible,
    );

    if (issues.length > 0 || size === null) {
      throw new ConflictError("Species selection is invalid", { issues });
    }

    const statuses = applyGrantOperations(
      collectSelectedGrants({ assetId: found.asset.id, featureGrants: definition.featureGrants }, chosen),
      selection.characterLevel,
    );
    const actor: ActorSnapshot = {
      ...selection.actor,
      characterLevel: selection.characterLevel,
      sourceLevel: selection.characterLevel,
    };
    const featureRows = await this.features.repository.findByAssetIds(
      db,
      statuses.map(({ grant }) => grant.featureAssetId),
    );
    const resolvedByIndex = new Map<number, ResolvedFeatureGraph>();

    for (const [index, item] of statuses.entries()) {
      const feature = featureRows.get(item.grant.featureAssetId);

      if (!feature || item.status === "LOCKED" || item.status === "REPLACED") {
        continue;
      }

      resolvedByIndex.set(
        index,
        await this.features.resolveFeature(feature, {
          viewer: input.viewer,
          visibleAssetIds: input.visibleAssetIds,
          bindings: {
            parameters: bindingParameters(item.grant, actor),
            choices: Object.fromEntries(
              selection.choices
                .filter((choice) => choice.grantKey === item.grant.key)
                .map((choice) => [choice.choiceKey, [...choice.values]]),
            ),
          },
          actor,
          db,
        }),
      );
    }

    const applied = [...resolvedByIndex.entries()].filter(
      ([index]) => statuses[index]?.status === "APPLIED",
    );
    const evaluated = this.features.evaluateEffects(
      applied.map(([index, resolved]) => ({
        found: featureRows.get(statuses[index]?.grant.featureAssetId as string) as NonNullable<
          ReturnType<typeof featureRows.get>
        >,
        resolved,
      })),
    );
    const evaluatedStatus = new Map(
      evaluated.instances.map((instance) => [applied[instance.index]?.[0], instance.status]),
    );

    return {
      characterLevel: selection.characterLevel,
      size,
      creatureType: found.species.creatureType,
      movementModes: definition.movementModes,
      variants: chosen.map((variant) => ({
        variantId: variant.variantId,
        assetId: variant.assetId,
        code: variant.code,
        name: variant.name,
        variantGroupCode: variant.variantGroupCode,
      })),
      grants: statuses.map((item, index) => {
        const resolved = resolvedByIndex.get(index);
        const feature = featureRows.get(item.grant.featureAssetId);

        return {
          sourceType: item.sourceType,
          sourceAssetId: item.sourceAssetId,
          key: item.grant.key,
          minimumCharacterLevel: item.grant.minimumCharacterLevel,
          featureAssetId: item.grant.featureAssetId,
          operation: item.grant.operation,
          targetFeatureAssetId: item.grant.targetFeatureAssetId,
          status: evaluatedStatus.get(index) ?? item.status,
          resolved:
            resolved && feature
              ? toResolvedFeatureResponse(feature, input.viewer.rulesetId, resolved)
              : null,
        };
      }),
      totals: evaluated.totals,
    };
  }
}

/** Parameter values of a grant: fixed ones and those taken from the actor. */
function bindingParameters(
  grant: SpeciesFeatureGrant,
  actor: ActorSnapshot,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  for (const binding of grant.bindings) {
    if (binding.bindingSource === "STATIC") {
      parameters[binding.parameterKey] = binding.staticValue;
    } else {
      const value = contextValue(binding.contextKey ?? "", actor);

      if (value !== undefined) {
        parameters[binding.parameterKey] = value;
      }
    }
  }

  return parameters;
}

