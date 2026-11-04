import type { AppDatabase } from "#core/db/pool";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { AssetLinkBaseSchema } from "#src/modules/asset-links/domain/dto/BaseAssetLinkDto";
import { assetLinks } from "#src/modules/asset-links/domain/entities/AssetLinksTable";
import type { AssetLinkRow } from "#src/modules/asset-links/domain/repository/AssetLinksRepository";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";

export const ASSET_LINK_ENTITY_TYPE = "assetLink";

export const ASSET_LINK_ACTIONS = {
  create: "assetLink.create",
  update: "assetLink.update",
  delete: "assetLink.delete",
} as const;

type TrackedAssetLinkDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  /** Old values must still fit the relation when they are written back. */
  parseMetadata(relationType: string, metadata: unknown): unknown;
  /** Undoing and restoring must not change links of archived assets either. */
  assertSourceChangeable(sourceAssetId: string, db: AppDatabase): Promise<void>;
};

/**
 * History rules of a link: GMs and editors may change links, so only they read the history.
 * Target and relation never change, because a different target is a different link. In the history
 * of the source asset the link appears as a child (`includeChildren`).
 */
export function createTrackedAssetLink(deps: TrackedAssetLinkDeps) {
  return defineTrackedEntity({
    type: ASSET_LINK_ENTITY_TYPE,
    table: assetLinks,
    baseSchema: AssetLinkBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.sourceAssetId }),
    access: campaignHistoryAccess<AssetLinkRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      label: field.value(),
      sortOrder: field.position(),
      metadata: field.value(),
      // Set once when the link is created.
      campaignId: field.ignore(),
      sourceAssetId: field.ignore(),
      targetAssetId: field.ignore(),
      relationType: field.ignore(),
      allowMultiple: field.ignore(),
    },
    validate: (next) => {
      if (!next.deletedAt) {
        deps.parseMetadata(next.relationType, next.metadata);
      }
    },
    guard: async (next, _current, db) => {
      if (!next.deletedAt) {
        await deps.assertSourceChangeable(next.sourceAssetId, db);
      }
    },
  });
}

export type TrackedAssetLink = ReturnType<typeof createTrackedAssetLink>;
