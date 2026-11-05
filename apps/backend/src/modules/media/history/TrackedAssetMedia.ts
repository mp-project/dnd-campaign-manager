import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { AssetMediaBaseSchema } from "#src/modules/media/domain/dto/BaseMediaDto";
import { assetMedia } from "#src/modules/media/domain/entities/MediaTable";
import type { AssetMediaRow } from "#src/modules/media/domain/repository/MediaRepository";

export const ASSET_MEDIA_ENTITY_TYPE = "assetMedia";

export const ASSET_MEDIA_ACTIONS = {
  attach: "assetMedia.attach",
  update: "assetMedia.update",
  detach: "assetMedia.detach",
} as const;

type TrackedAssetMediaDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  /** Undoing and restoring must not change assignments of archived assets either. */
  assertAssetChangeable(assetId: string, db: AppDatabase): Promise<void>;
};

/** Images that players see need a description, also when an old state is written back. */
export function assertAltTextForPlayers(values: {
  isImage: boolean;
  visibility: AssetMediaRow["visibility"];
  altText: string | null;
}): void {
  if (values.isImage && values.visibility === "WITH_ASSET" && !values.altText) {
    throw new ValidationError("Images visible to players need an alt text");
  }
}

/**
 * History rules of an assignment: GMs and editors may change it, so only they read the history. The
 * file itself has no history, because it never changes. In the history of the asset the assignment
 * appears as a child (`includeChildren`).
 */
export function createTrackedAssetMedia(deps: TrackedAssetMediaDeps) {
  return defineTrackedEntity({
    type: ASSET_MEDIA_ENTITY_TYPE,
    table: assetMedia,
    baseSchema: AssetMediaBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    groups: [["visibility", "altText"]],
    access: campaignHistoryAccess<AssetMediaRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      role: field.value(),
      title: field.value(),
      caption: field.value(),
      altText: field.value(),
      visibility: field.value(),
      isPrimary: field.value(),
      displayOrder: field.position(),
      // Set once when the file is attached.
      campaignId: field.ignore(),
      assetId: field.ignore(),
      mediaId: field.ignore(),
      isImage: field.ignore(),
    },
    validate: (next) => {
      if (!next.deletedAt) {
        assertAltTextForPlayers(next);
      }
    },
    guard: async (next, _current, db) => {
      if (!next.deletedAt) {
        await deps.assertAssetChangeable(next.assetId, db);
      }
    },
  });
}

export type TrackedAssetMedia = ReturnType<typeof createTrackedAssetMedia>;
