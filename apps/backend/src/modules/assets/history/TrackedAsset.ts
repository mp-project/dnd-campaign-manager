import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { AssetBaseSchema } from "#src/modules/assets/domain/dto/BaseAssetDto";
import { assets } from "#src/modules/assets/domain/entities/AssetsTable";
import type {
  AssetRow,
  AssetsRepository,
} from "#src/modules/assets/domain/repository/AssetsRepository";

export const ASSET_ENTITY_TYPE = "asset";

export const ASSET_ACTIONS = {
  update: "asset.update",
  archive: "asset.archive",
  restore: "asset.restore",
} as const;

/** The only changes a GM may make directly, so also the only ones a GM may undo. */
const GM_REVERTIBLE_ACTIONS: readonly string[] = [ASSET_ACTIONS.archive, ASSET_ACTIONS.restore];

type TrackedAssetDeps = {
  repository: AssetsRepository;
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  assertCanArchive(asset: AssetRow, db: AppDatabase): Promise<void>;
};

/**
 * History rules of an asset. Only people who may change an asset see its history: the GM of its
 * campaign and administrators. A right to undo must not go beyond the right to change directly: GMs
 * may archive and restore assets of their campaign, everything else is left to administrators.
 */
export function createTrackedAsset(deps: TrackedAssetDeps) {
  const campaignAccess = campaignHistoryAccess<AssetRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
    editRoles: ["GM"],
  });

  return defineTrackedEntity({
    type: ASSET_ENTITY_TYPE,
    table: assets,
    baseSchema: AssetBaseSchema,
    campaignId: (row) => row.campaignId,
    groups: [["rulesetPolicy", "rulesetIds"]],
    access: {
      read: async (context, row, db) =>
        row.campaignId !== null && campaignAccess.read(context, row, db),
      readField: async (context, row, name, db) =>
        row.campaignId !== null &&
        ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
      revert: async (context, row, change, db) =>
        row.campaignId !== null &&
        context.actorId !== null &&
        GM_REVERTIBLE_ACTIONS.includes(change.action) &&
        (await deps.resolveRole(row.campaignId, context.actorId, db)) === "GM",
    },
    fields: {
      title: field.value(),
      slug: field.value(),
      summary: field.value(),
      status: field.value(),
      assetFamilyId: field.value(),
      rulesetPolicy: field.value(),
      sourceReference: field.value(),
      // Set once when the asset is created.
      assetType: field.ignore(),
      scope: field.ignore(),
      origin: field.ignore(),
      campaignId: field.ignore(),
    },
    lists: {
      rulesetIds: field.list({
        load: async (db, id) => (await deps.repository.listRulesetIds(db, [id])).get(id) ?? [],
        save: (db, assetId, rulesetIds, actorId) =>
          deps.repository.updateRulesets(db, { assetId, actorId, rulesetIds }),
      }),
    },
    validate: (next, current) => {
      if (current.status === "ARCHIVED" && next.status === "ARCHIVED") {
        throw new ConflictError("Archived assets cannot be modified");
      }

      const rulesetIds = next.rulesetIds as readonly string[];

      if (next.rulesetPolicy === "NEUTRAL" && rulesetIds.length > 0) {
        throw new ValidationError("Neutral assets cannot be restricted to rulesets");
      }

      if (next.rulesetPolicy === "RESTRICTED" && rulesetIds.length === 0) {
        throw new ValidationError("Restricted assets require at least one ruleset");
      }
    },
    // Here and not in `archiveBase`, because undoing a restore archives an asset as well.
    guard: async (next, current, db) => {
      if (next.status === "ARCHIVED" && current.status !== "ARCHIVED") {
        await deps.assertCanArchive(next, db);
      }
    },
  });
}

export type TrackedAsset = ReturnType<typeof createTrackedAsset>;
