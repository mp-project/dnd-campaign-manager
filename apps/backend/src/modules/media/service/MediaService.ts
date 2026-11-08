import type { Readable } from "node:stream";

import { campaignRoleOf } from "#core/content/viewer";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope, ChangeResult } from "#core/history/types";
import type { StoragePort } from "#core/storage/index";
import type {
  AssetRow,
  AssetsService,
  CampaignAssetViewer,
} from "#src/modules/assets/index";
import type {
  AttachMediaDto,
  UpdateAssetMediaDto,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import type {
  AssetMediaRow,
  MediaFileRow,
  MediaRepository,
  MediaVariantRow,
} from "#src/modules/media/domain/repository/MediaRepository";
import {
  assertAltTextForPlayers,
  createTrackedAssetMedia,
  type TrackedAssetMedia,
} from "#src/modules/media/history/TrackedAssetMedia";
import type { MediaCleanupService } from "#src/modules/media/service/MediaCleanupService";

/** Campaign facts the module needs; provided by the campaigns module. */
export type MediaCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
};

export type MediaDeliveryConfig = {
  downloadUrlTtlSeconds: number;
};

/** What a request gets: the file itself, or a smaller variant of it. */
export type MediaContentTarget = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
};

type AssignmentPath = { campaignId: string; assetId: string; assignmentId: string };

/**
 * Files and their assignments to assets.
 *
 * Methods taking an action scope are meant to be called by use cases inside their own action, also
 * those of domain modules; they do not check rights, which remain the caller's responsibility.
 */
export class MediaService {
  public readonly trackedAssignment: TrackedAssetMedia;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: MediaRepository,
    private readonly storage: StoragePort,
    private readonly assets: AssetsService,
    campaignAccess: MediaCampaignAccessPort,
    private readonly cleanup: MediaCleanupService,
    public readonly config: MediaDeliveryConfig,
  ) {
    this.trackedAssignment = createTrackedAssetMedia({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertAssetChangeable: async (assetId, tx) => {
        this.assertNotArchived(await assets.requireAsset(tx, assetId));
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  /** Global files are visible to every campaign; files of other campaigns are reported as 404. */
  async requireFileInCampaign(
    campaignId: string,
    mediaId: string,
    db: AppDatabase = this.db,
  ): Promise<MediaFileRow> {
    const file = await this.repository.findFileById(db, mediaId);

    if (!file || (file.scope === "CAMPAIGN" && file.campaignId !== campaignId)) {
      throw new NotFoundError("Media not found");
    }

    return file;
  }

  /** Players only get ready files attached for them to an asset they may see. */
  async requireFileForViewer(
    viewer: CampaignAssetViewer,
    mediaId: string,
  ): Promise<MediaFileRow> {
    const file = await this.requireFileInCampaign(viewer.campaignId, mediaId);

    if (viewer.view === "FULL") {
      return file;
    }

    const assetIds = await this.repository.listPlayerAssetIdsOfFile(this.db, {
      campaignId: viewer.campaignId,
      mediaId,
    });
    const visible = await this.listAssetIdsVisibleToPlayer(viewer, assetIds);

    if (file.status !== "READY" || visible.length === 0) {
      throw new NotFoundError("Media not found");
    }

    return file;
  }

  /** Assets among `candidates` that the player may see; all of the campaign without candidates. */
  async listAssetIdsVisibleToPlayer(
    viewer: CampaignAssetViewer,
    candidates?: readonly string[],
  ): Promise<string[]> {
    const visibleIds = await this.assets.listVisibleAssetIds(viewer);
    const visible = new Set(visibleIds);
    const found = await this.assets.findMany(candidates ?? visibleIds);

    return [...found.values()]
      .filter((asset) => this.assets.isVisibleToPlayer(asset, visible))
      .map((asset) => asset.id);
  }

  /** A variant that isn't ready yet, or doesn't exist for this type, falls back to the file. */
  async resolveContentTarget(
    file: MediaFileRow,
    kind?: MediaVariantRow["kind"],
  ): Promise<MediaContentTarget> {
    if (file.status !== "READY") {
      throw new NotFoundError("Media not found");
    }

    const variant = kind ? await this.repository.findReadyVariant(this.db, file.id, kind) : null;

    return variant
      ? {
          storageKey: variant.storageKey,
          mimeType: variant.mimeType,
          sizeBytes: variant.sizeBytes ?? 0,
          etag: `${file.sha256}-${variant.kind.toLowerCase()}`,
        }
      : {
          storageKey: file.storageKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          etag: file.sha256,
        };
  }

  get supportsDirectDownload(): boolean {
    return this.storage.supportsDirectDownload;
  }

  createContentUrl(target: MediaContentTarget, headers: { disposition: string }): Promise<string> {
    const ttl = this.config.downloadUrlTtlSeconds;

    return this.storage.createDownloadUrl(target.storageKey, ttl, {
      contentType: target.mimeType,
      contentDisposition: headers.disposition,
      cacheControl: `private, max-age=${ttl}`,
    });
  }

  async openContent(target: MediaContentTarget): Promise<Readable> {
    if (!(await this.storage.exists(target.storageKey))) {
      throw new NotFoundError("Media not found");
    }

    return this.storage.getStream(target.storageKey);
  }

  /**
   * Only for files without assignments. The row goes first and the object after the commit, so a
   * failing storage can leave an object behind for the cleanup, but never a row without object.
   */
  async deleteIfUnused(params: {
    campaignId: string;
    mediaId: string;
    actorId: string;
  }): Promise<void> {
    const file = await this.transactionManager.inTransaction(async (tx) => {
      const locked = await this.repository.lockFileForDelete(tx, params.mediaId);

      if (!locked || (locked.scope === "CAMPAIGN" && locked.campaignId !== params.campaignId)) {
        throw new NotFoundError("Media not found");
      }

      const usage = await this.repository.countAssignments(tx, [locked.id]);
      const usageCount = usage.get(locked.id) ?? 0;

      if (usageCount > 0) {
        throw new ConflictError("The file is still attached to assets", { usageCount });
      }

      await this.repository.deleteFile(tx, locked.id, params.actorId);

      return locked;
    });

    await this.cleanup.deleteObject(file);
  }

  // ---------------------------------------------------------------------------
  // Assignments, port for domain modules
  // ---------------------------------------------------------------------------

  async attach(
    scope: ActionScope,
    params: { campaignId: string; assetId: string },
    input: AttachMediaDto,
  ): Promise<{ assignment: AssetMediaRow; file: MediaFileRow }> {
    const db = scope.tx;

    await this.assets.lockForUse([params.assetId], db);

    const asset = await this.assets.requireAsset(db, params.assetId);

    this.assets.assertSameCampaign(asset, params.campaignId);

    if (asset.scope !== "CAMPAIGN") {
      throw new ConflictError("Only assets of a campaign can have media", { assetId: asset.id });
    }

    this.assertNotArchived(asset);

    const file = await this.repository.lockFileForUse(db, input.mediaId);

    if (!file || (file.scope === "CAMPAIGN" && file.campaignId !== params.campaignId)) {
      throw new NotFoundError("Media not found");
    }

    if (file.status !== "READY") {
      throw new ConflictError("The file is not ready", { status: file.status });
    }

    const values = {
      isImage: file.mimeType.startsWith("image/"),
      visibility: input.visibility,
      altText: input.altText ?? file.altText,
    };

    assertAltTextForPlayers(values);

    if (input.isPrimary) {
      await this.clearPrimary(scope, asset.id, input.role);
    }

    const assignment = await this.withConstraintErrors(() =>
      scope.create(this.trackedAssignment, {
        ...values,
        campaignId: params.campaignId,
        assetId: asset.id,
        mediaId: file.id,
        role: input.role,
        title: input.title ?? file.title,
        caption: input.caption ?? null,
        isPrimary: input.isPrimary,
        displayOrder: input.displayOrder,
      }),
    );

    return { assignment, file };
  }

  /**
   * Also covers reordering and choosing the primary file: a new primary replaces the old one.
   * Fields the client sent unchanged while somebody else changed them keep the newer value; they
   * are listed in `merged`.
   */
  async updateAssignment(
    scope: ActionScope,
    params: AssignmentPath & { command: UpdateAssetMediaDto },
  ): Promise<ChangeResult<AssetMediaRow>> {
    const { expectedVersion, ...patch } = params.command;

    return this.withConstraintErrors(() =>
      scope.change(this.trackedAssignment, params.assignmentId, async (current) => {
        this.assertAssignmentOfPath(current, params);

        if (patch.isPrimary ?? current.isPrimary) {
          await this.clearPrimary(scope, current.assetId, patch.role ?? current.role, current.id);
        }

        return {
          set: Object.fromEntries(
            Object.entries(patch).filter(([, value]) => value !== undefined),
          ),
          baseVersion: expectedVersion,
        };
      }),
    );
  }

  /** Removes the assignment only; the file stays. Also works on archived assets. */
  async detach(scope: ActionScope, params: AssignmentPath): Promise<void> {
    const assignment = await this.repository.findAssignmentById(scope.tx, params.assignmentId);

    if (!assignment) {
      throw new NotFoundError("Assignment not found");
    }

    this.assertAssignmentOfPath(assignment, params);

    await scope.softDelete(this.trackedAssignment, assignment.id);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async clearPrimary(
    scope: ActionScope,
    assetId: string,
    role: AssetMediaRow["role"],
    exceptId?: string,
  ): Promise<void> {
    const primary = await this.repository.findPrimaryAssignment(scope.tx, {
      assetId,
      role,
      ...(exceptId ? { exceptId } : {}),
    });

    if (primary) {
      await scope.change(this.trackedAssignment, primary.id, () => ({
        set: { isPrimary: false },
      }));
    }
  }

  private assertNotArchived(asset: AssetRow): void {
    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Media of archived assets cannot be modified", {
        assetId: asset.id,
      });
    }
  }

  private assertAssignmentOfPath(assignment: AssetMediaRow, path: AssignmentPath): void {
    if (assignment.campaignId !== path.campaignId || assignment.assetId !== path.assetId) {
      throw new NotFoundError("Assignment not found");
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("This assignment or primary file already exists");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced asset or file not found");
      }

      throw error;
    }
  }
}
