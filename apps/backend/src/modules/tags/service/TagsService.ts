import { campaignRoleOf } from "#core/content/viewer";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import { field } from "#core/history/defineTrackedEntity";
import type { ActionScope, ChangeResult } from "#core/history/types";
import type { AssetRow, AssetsService } from "#src/modules/assets/index";
import { normalizeTagName } from "#src/modules/tags/domain/dto/BaseTagDto";
import type { CreateTagDto } from "#src/modules/tags/domain/dto/CreateTagDto";
import type { UpdateTagDto } from "#src/modules/tags/domain/dto/UpdateTagDto";
import type { TagRow, TagsRepository } from "#src/modules/tags/domain/repository/TagsRepository";
import {
  ASSET_TAGS_ACTION,
  ASSET_TAGS_FIELD,
  createTrackedTag,
  type TrackedTag,
} from "#src/modules/tags/history/TrackedTag";

/** Campaign facts the module needs; provided by the campaigns module. */
export type TagCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
};

/**
 * Campaign tags and their assignments to assets. Tags only organize content: they grant no access
 * and change neither rulesets nor shares.
 *
 * Methods taking an action scope are meant to be called by use cases inside their own action, also
 * those of domain modules; they do not check rights, which remain the caller's responsibility.
 */
export class TagsService {
  public readonly trackedTag: TrackedTag;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: TagsRepository,
    private readonly assets: AssetsService,
    campaignAccess: TagCampaignAccessPort,
  ) {
    this.trackedTag = createTrackedTag({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
    });

    assets.registerTrackedList(
      ASSET_TAGS_FIELD,
      field.list({
        load: (db, assetId) => repository.listIdsForAsset(db, assetId),
        save: (db, assetId, tagIds, actorId) => this.saveAssignments(db, assetId, tagIds, actorId),
      }),
      ASSET_TAGS_ACTION,
    );
  }

  async createTag(
    scope: ActionScope,
    params: { campaignId: string },
    input: CreateTagDto,
  ): Promise<TagRow> {
    return this.withConstraintErrors(() =>
      scope.create(this.trackedTag, {
        campaignId: params.campaignId,
        name: input.name,
        normalizedName: normalizeTagName(input.name),
        color: input.color ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      }),
    );
  }

  /**
   * Fields the client sent unchanged while somebody else changed them keep the newer value; they
   * are listed in `merged`.
   */
  async updateTag(
    scope: ActionScope,
    params: { campaignId: string; tagId: string; command: UpdateTagDto },
  ): Promise<ChangeResult<TagRow>> {
    const { expectedVersion, ...patch } = params.command;

    return this.withConstraintErrors(() =>
      scope.change(this.trackedTag, params.tagId, (current) => {
        this.assertTagOfCampaign(current, params.campaignId);

        const set: Record<string, unknown> = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        );

        if (patch.name !== undefined) {
          set.normalizedName = normalizeTagName(patch.name);
        }

        return { set, baseVersion: expectedVersion };
      }),
    );
  }

  /**
   * A tag in use is refused unless `forceDetach` removes it from all assets first. That is a change
   * of each asset, so archived assets refuse it and the whole deletion is rolled back.
   */
  async deleteTag(
    scope: ActionScope,
    params: { campaignId: string; tagId: string; forceDetach: boolean },
  ): Promise<void> {
    const tag = await this.repository.lockForDelete(scope.tx, params.tagId);

    if (!tag) {
      throw new NotFoundError("Tag not found");
    }

    this.assertTagOfCampaign(tag, params.campaignId);

    const assetIds = await this.repository.listAssetIdsOfTag(scope.tx, tag.id);

    if (assetIds.length > 0 && !params.forceDetach) {
      throw new ConflictError("The tag is still in use", { usageCount: assetIds.length });
    }

    for (const assetId of assetIds) {
      await this.assets.updateTrackedList(scope, {
        assetId,
        field: ASSET_TAGS_FIELD,
        build: (current) => current.filter((tagId) => tagId !== tag.id),
      });
    }

    await scope.softDelete(this.trackedTag, tag.id);
  }

  /** The list of the asset becomes exactly `tagIds`; only the difference is written. */
  async replaceAssignments(
    scope: ActionScope,
    params: {
      campaignId: string;
      assetId: string;
      tagIds: readonly string[];
      expectedVersion?: number;
    },
  ): Promise<ChangeResult<AssetRow>> {
    await this.prepareAssignment(scope.tx, params.campaignId, params.assetId, params.tagIds);

    return this.assets.updateTrackedList(scope, {
      assetId: params.assetId,
      field: ASSET_TAGS_FIELD,
      build: () => params.tagIds,
      ...(params.expectedVersion !== undefined ? { baseVersion: params.expectedVersion } : {}),
    });
  }

  /** Adds one tag and keeps the others; assigning it twice changes nothing. */
  async assign(
    scope: ActionScope,
    params: { campaignId: string; assetId: string; tagId: string },
  ): Promise<ChangeResult<AssetRow>> {
    await this.prepareAssignment(scope.tx, params.campaignId, params.assetId, [params.tagId]);

    return this.assets.updateTrackedList(scope, {
      assetId: params.assetId,
      field: ASSET_TAGS_FIELD,
      build: (current) => [...current, params.tagId],
    });
  }

  async getUsageCount(tagId: string, db: AppDatabase = this.db): Promise<number> {
    return (await this.repository.countUsages(db, [tagId])).get(tagId) ?? 0;
  }

  /**
   * Locks the tags before the asset, like a forced deletion, so the two cannot deadlock. A tag the
   * caller cannot use in this campaign is reported as 404 to avoid leaking ids.
   */
  private async prepareAssignment(
    db: AppDatabase,
    campaignId: string,
    assetId: string,
    tagIds: readonly string[],
  ): Promise<void> {
    const asset = await this.assets.requireAsset(db, assetId);

    this.assets.assertSameCampaign(asset, campaignId);

    if (asset.scope !== "CAMPAIGN") {
      throw new ConflictError("Only assets of a campaign can be tagged", { assetId });
    }

    const active = await this.repository.lockActiveIds(db, campaignId, tagIds);

    if (active.length !== new Set(tagIds).size) {
      throw new NotFoundError("Tag not found");
    }
  }

  /**
   * Also the way back for undoing and restoring: an old list can name tags that were deleted since,
   * and a deleted tag does not come back.
   */
  private async saveAssignments(
    db: AppDatabase,
    assetId: string,
    tagIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    if (tagIds.length === 0) {
      await this.repository.deleteAssetTagsExcept(db, { assetId, keep: [], actorId });

      return;
    }

    const { campaignId } = await this.assets.requireAsset(db, assetId);
    const active = campaignId ? await this.repository.lockActiveIds(db, campaignId, tagIds) : [];

    if (!campaignId || active.length !== tagIds.length) {
      throw new ConflictError("A tag of this list no longer exists");
    }

    await this.repository.deleteAssetTagsExcept(db, { assetId, keep: tagIds, actorId });

    const existing = new Set(await this.repository.listIdsForAsset(db, assetId));

    await this.repository.createAssetTags(db, {
      campaignId,
      assetId,
      tagIds: tagIds.filter((tagId) => !existing.has(tagId)),
      actorId,
    });
  }

  private assertTagOfCampaign(tag: TagRow, campaignId: string): void {
    if (tag.campaignId !== campaignId) {
      throw new NotFoundError("Tag not found");
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("A tag with this name already exists");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign not found");
      }

      throw error;
    }
  }
}
