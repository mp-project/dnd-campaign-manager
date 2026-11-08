import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { FeatureBaseSchema } from "#src/modules/features/domain/dto/BaseFeatureDto";
import {
  type FeatureGraph,
  FeatureGraphSchema,
} from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import { features, FEATURE_GRAPH_PARTS } from "#src/modules/features/domain/entities/FeaturesTable";
import { validateFeatureDefinition } from "#src/modules/features/domain/FeatureDefinition";
import type { FeatureRow } from "#src/modules/features/domain/repository/FeaturesRepository";

export const FEATURE_ENTITY_TYPE = "feature";

export const FEATURE_ACTIONS = {
  create: "feature.create",
  update: "feature.update",
  delete: "feature.delete",
  restore: "feature.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const FEATURE_ASSET_ACTIONS: readonly string[] = [
  FEATURE_ACTIONS.update,
  FEATURE_ACTIONS.delete,
  FEATURE_ACTIONS.restore,
];

type TrackedFeatureDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
  /**
   * Checks the referenced assets of the definition and that its asset may still change. Runs for
   * every change, so undoing and restoring cannot bring back a cycle or an unavailable target.
   */
  assertReferencesValid(row: FeatureRow & { graph: FeatureGraph }, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across them; throws 400 with all issues. */
export function parseFeatureGraph(row: Pick<FeatureRow, (typeof FEATURE_GRAPH_PARTS)[number] | "sections">): FeatureGraph {
  const parsed = FeatureGraphSchema.safeParse({
    sections: row.sections,
    parameters: row.parameters,
    choices: row.choices,
    resources: row.resources,
    scalingTracks: row.scalingTracks,
    activations: row.activations,
    effects: row.effects,
    supersedes: row.supersedes,
  });

  if (!parsed.success) {
    throw new ValidationError("Feature definition is invalid", parsed.error.issues);
  }

  const issues = validateFeatureDefinition(parsed.data);

  if (issues.length > 0) {
    throw new ValidationError("Feature definition is invalid", issues);
  }

  return parsed.data;
}

/**
 * History rules of feature definitions. Custom features: GMs and editors may change them, so only
 * they read the history. Global features are changed by administrators only, who pass every check
 * anyway. In the history of the asset the feature appears as a child; name, summary, status and
 * rulesets are fields of the asset and follow its rights.
 */
export function createTrackedFeature(deps: TrackedFeatureDeps) {
  const campaignAccess = campaignHistoryAccess<FeatureRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return defineTrackedEntity({
    type: FEATURE_ENTITY_TYPE,
    table: features,
    baseSchema: FeatureBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    // The rule parts refer to each other by key, so a change to one of them is a conflict with a
    // change to any other; a mix of two versions could be inconsistent.
    groups: [FEATURE_GRAPH_PARTS],
    access: {
      read: async (context, row, db) =>
        row.campaignId !== null && campaignAccess.read(context, row, db),
      readField: async (context, row, name, db) =>
        row.campaignId !== null &&
        ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
      revert: async (context, row, change, db) =>
        row.campaignId !== null &&
        ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
      restore: async (context, row, db) =>
        row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
    },
    fields: {
      code: field.value(),
      featureType: field.value(),
      // Long texts and graphs, so fewer versions are kept.
      description: field.value({ history: "low" }),
      stackingMode: field.value(),
      sections: field.value({ history: "low" }),
      parameters: field.value({ history: "low" }),
      choices: field.value({ history: "low" }),
      resources: field.value({ history: "low" }),
      scalingTracks: field.value({ history: "low" }),
      activations: field.value({ history: "low" }),
      effects: field.value({ history: "low" }),
      supersedes: field.value({ history: "low" }),
      // Set once when the feature is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseFeatureGraph(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertReferencesValid({ ...next, graph: parseFeatureGraph(next) }, db);
    },
  });
}

export type TrackedFeature = ReturnType<typeof createTrackedFeature>;
