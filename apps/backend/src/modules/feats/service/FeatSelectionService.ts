import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import {
  type ActorSnapshot,
  type FeaturesService,
  type ResolvedFeatureGraph,
  toResolvedFeatureResponse,
} from "#src/modules/features/index";
import type { FeatDefinition, FeatFeatureGrant } from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import type { EligibilityCheckDto, ResolveFeatDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type {
  ResponseFeatEligibilityDto,
  ResponseFeatResolutionDto,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import { toPlayerChoices, toPlayerGrants } from "#src/modules/feats/domain/FeatDefinition";
import { evaluateFeatEligibility, validateFeatChoices } from "#src/modules/feats/domain/FeatEligibility";
import type { FeatWithAsset } from "#src/modules/feats/domain/repository/FeatsRepository";

type Header = "featId" | "assetId" | "view";

/** Context values a CONTEXT binding may take, from the actor snapshot. */
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

/** Parameter values of a grant: fixed ones, those taken from the actor and from feat choices. */
function bindingParameters(
  grant: FeatFeatureGrant,
  actor: ActorSnapshot,
  choices: Readonly<Record<string, readonly string[]>>,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  for (const binding of grant.bindings) {
    if (binding.bindingSource === "STATIC") {
      parameters[binding.parameterKey] = binding.staticValue;
    } else if (binding.bindingSource === "CONTEXT") {
      const value = contextValue(binding.contextKey ?? "", actor);

      if (value !== undefined) {
        parameters[binding.parameterKey] = value;
      }
    } else {
      const value = choices[binding.choiceKey ?? ""]?.[0];

      if (value !== undefined) {
        parameters[binding.parameterKey] = value;
      }
    }
  }

  return parameters;
}

/**
 * The eligibility check and the resolution of a feat's choices and grants, for the catalog routes
 * and the character modules. Changes nothing: the character modules store which feat a character
 * took, with its choices, in their own transaction.
 *
 * `isVisible` decides what the viewer sees. Players get a preview without options and grants of
 * assets they may not see; the character modules check with everything visible.
 */
export class FeatSelectionService {
  constructor(
    private readonly assets: AssetsService,
    private readonly features: FeaturesService,
  ) {}

  /**
   * Whether the character described by the snapshot may take the feat (see
   * `evaluateFeatEligibility`). Reasons don't name assets the viewer may not see. Only active
   * feats can be taken anew.
   */
  checkEligibility(
    found: FeatWithAsset,
    definition: FeatDefinition,
    command: EligibilityCheckDto,
    isVisible: (assetId: string) => boolean = () => true,
  ): Omit<ResponseFeatEligibilityDto, Header> {
    const result = evaluateFeatEligibility(
      {
        assetId: found.asset.id,
        category: found.feat.category,
        minimumCharacterLevel: found.feat.minimumCharacterLevel,
        definition: { ...definition, choices: toPlayerChoices(definition.choices, isVisible) },
      },
      command.actor,
      command.acquisitionContext,
    );

    if (found.asset.status !== "ACTIVE") {
      return {
        ...result,
        outcome: "INELIGIBLE",
        eligible: false,
        unknownFacts: [],
        reasons: [
          {
            code: "STATUS",
            nodeType: null,
            path: ["status"],
            message: "Only active feats can be taken",
            assetId: null,
          },
          ...result.reasons,
        ],
      };
    }

    return {
      ...result,
      reasons: result.reasons.map((reason) => ({
        ...reason,
        assetId: reason.assetId !== null && isVisible(reason.assetId) ? reason.assetId : null,
      })),
    };
  }

  /**
   * Checks the answers to the feat's choices and resolves every grant: each granted feature with
   * its parameters and choices bound, and the passive effects added up. Answers to filtered
   * choices are asset ids of the filter's types that the campaign may use; the filter's criteria
   * are applied once the modules of those types exist. Invalid answers are a conflict (409)
   * listing every issue; a choice that does not fit a granted feature is a 400 from the features
   * module. Upgrades and replacements are reported as applied; which feature of the character they
   * change is up to the character modules. Callers inside a transaction pass its handle as `db`.
   */
  async resolveFeat(
    found: FeatWithAsset,
    input: {
      access: ContentAccess;
      definition: FeatDefinition;
      isVisible: (assetId: string) => boolean;
      command: ResolveFeatDto;
      db?: AppDatabase | undefined;
    },
  ): Promise<Omit<ResponseFeatResolutionDto, Header>> {
    const db = input.db ?? this.features.db;
    const { command } = input;
    const choices = toPlayerChoices(input.definition.choices, input.isVisible);
    const issues = validateFeatChoices(choices, command.choices);

    for (const choice of choices) {
      const values = command.choices[choice.key] ?? [];

      if (choice.optionFilter === null || values.length === 0) {
        continue;
      }

      const assets = await this.assets.findMany(values, db);
      const readable = await input.access.readableIds("CATALOG", [...assets.values()], db);

      for (const value of values) {
        const asset = assets.get(value);

        if (!asset || !readable.has(value)) {
          issues.push({ path: ["choices", choice.key], message: `'${value}' is no option of the choice` });
        } else if (!choice.optionFilter.assetTypes.includes(asset.assetType)) {
          issues.push({
            path: ["choices", choice.key],
            message: `'${value}' is no ${choice.optionFilter.assetTypes.join(" or ")}`,
          });
        }
      }
    }

    if (found.asset.status !== "ACTIVE") {
      issues.unshift({ path: [], message: "Only active feats can be taken" });
    }

    if (issues.length > 0) {
      throw new ConflictError("Feat choices are invalid", { issues });
    }

    const grants = toPlayerGrants(input.definition.featureGrants, input.isVisible);
    const actor: ActorSnapshot = {
      ...command.actor,
      characterLevel: command.characterLevel,
      sourceLevel: command.characterLevel,
    };
    const featureRows = await this.features.repository.findByAssetIds(
      db,
      grants.map((grant) => grant.featureAssetId),
    );
    const resolvedByIndex = new Map<number, ResolvedFeatureGraph>();

    for (const [index, grant] of grants.entries()) {
      const feature = featureRows.get(grant.featureAssetId);

      if (!feature) {
        continue;
      }

      resolvedByIndex.set(
        index,
        await this.features.resolveFeature(feature, {
          access: input.access,
          bindings: {
            parameters: bindingParameters(grant, actor, command.choices),
            choices: Object.fromEntries(
              command.featureChoices
                .filter((choice) => choice.grantKey === grant.key)
                .map((choice) => [choice.choiceKey, [...choice.values]]),
            ),
          },
          actor,
          db,
        }),
      );
    }

    const resolved = [...resolvedByIndex.entries()];
    const evaluated = this.features.evaluateEffects(
      resolved.map(([index, graph]) => ({
        found: featureRows.get(grants[index]?.featureAssetId as string) as NonNullable<
          ReturnType<typeof featureRows.get>
        >,
        resolved: graph,
      })),
    );
    const evaluatedStatus = new Map(
      evaluated.instances.map((instance) => [resolved[instance.index]?.[0], instance.status]),
    );

    return {
      characterLevel: command.characterLevel,
      choices: Object.fromEntries(
        Object.entries(command.choices).map(([key, values]) => [key, [...values]]),
      ),
      grants: grants.map((grant, index) => {
        const graph = resolvedByIndex.get(index);
        const feature = featureRows.get(grant.featureAssetId);

        return {
          key: grant.key,
          featureAssetId: grant.featureAssetId,
          operation: grant.operation,
          targetFeatureAssetId: grant.targetFeatureAssetId,
          status: evaluatedStatus.get(index) ?? "APPLIED",
          resolved:
            graph && feature
              ? toResolvedFeatureResponse(feature, input.access.viewer.rulesetId, graph)
              : null,
        };
      }),
      totals: evaluated.totals,
    };
  }
}
