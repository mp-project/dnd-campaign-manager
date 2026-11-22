import type { Readable } from "node:stream";

import { API_BASE_PATH } from "#core/config/constants";
import { campaignRoleOf } from "#core/content/viewer";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope, ChangeResult } from "#core/history/types";
import { downloadUrlWindow, normalizeFilename, type StoragePort } from "#core/storage/index";
import type {
  AssetRow,
  AssetsService,
  ContentAccess,
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
import { MediaLinkSigner } from "#src/modules/media/service/MediaLinkSigner";

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
  mediaId: string;
  /** The variant delivered; null for the original, also when a requested variant isn't ready. */
  kind: MediaVariantRow["kind"] | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
  /** Only images are shown inline; everything else downloads. */
  disposition: string;
};

export type MediaContentLink = { url: string; expiresAt: Date };

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
    private readonly linkSigner: MediaLinkSigner = new MediaLinkSigner(),
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
  async requireFileForViewer(access: ContentAccess, mediaId: string): Promise<MediaFileRow> {
    const [file] = await this.listFilesForViewer(access, [mediaId]);

    if (!file) {
      throw new NotFoundError("Media not found");
    }

    return file;
  }

  /**
   * The files of `requireFileForViewer`, for many at once; those the viewer may not see (or that
   * don't exist) are left out without a trace. Global files are visible to every campaign.
   */
  async listFilesForViewer(access: ContentAccess, mediaIds: string[]): Promise<MediaFileRow[]> {
    const { campaignId } = access.viewer;
    const files = (await this.repository.listFilesByIds(this.db, [...new Set(mediaIds)])).filter(
      (file) => file.scope !== "CAMPAIGN" || file.campaignId === campaignId,
    );

    if (access.isFullView) {
      return files;
    }

    const ready = files.filter((file) => file.status === "READY");
    const assetIdsByFile = await this.repository.listPlayerAssetIdsOfFiles(this.db, {
      campaignId,
      mediaIds: ready.map((file) => file.id),
    });
    const assets = await this.assets.findMany([...new Set([...assetIdsByFile.values()].flat())]);
    const readable = await access.readableIds("MANAGE", [...assets.values()]);

    return ready.filter((file) =>
      (assetIdsByFile.get(file.id) ?? []).some((assetId) => readable.has(assetId)),
    );
  }

  /** A variant that isn't ready yet, or doesn't exist for this type, falls back to the file. */
  async resolveContentTarget(
    file: MediaFileRow,
    kind?: MediaVariantRow["kind"],
  ): Promise<MediaContentTarget> {
    const target = (await this.resolveContentTargets([file], kind)).get(file.id);

    if (!target) {
      throw new NotFoundError("Media not found");
    }

    return target;
  }

  /** Per ready file what to deliver; files that aren't ready have no content yet. */
  async resolveContentTargets(
    files: MediaFileRow[],
    kind?: MediaVariantRow["kind"],
  ): Promise<Map<string, MediaContentTarget>> {
    const ready = files.filter((file) => file.status === "READY");
    const variants = kind
      ? await this.repository.listReadyVariants(
          this.db,
          ready.map((file) => file.id),
          kind,
        )
      : [];
    const variantByFile = new Map(variants.map((variant) => [variant.mediaId, variant]));

    return new Map(
      ready.map((file) => {
        const variant = variantByFile.get(file.id);

        return [
          file.id,
          variant
            ? {
                mediaId: file.id,
                kind: variant.kind,
                storageKey: variant.storageKey,
                mimeType: variant.mimeType,
                sizeBytes: variant.sizeBytes ?? 0,
                etag: `${file.sha256}-${variant.kind.toLowerCase()}`,
                disposition: contentDisposition(file, variant.mimeType),
              }
            : {
                mediaId: file.id,
                kind: null,
                storageKey: file.storageKey,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                etag: file.sha256,
                disposition: contentDisposition(file, file.mimeType),
              },
        ];
      }),
    );
  }

  get supportsDirectDownload(): boolean {
    return this.storage.supportsDirectDownload;
  }

  createContentUrl(target: MediaContentTarget): Promise<string> {
    const ttl = this.config.downloadUrlTtlSeconds;

    return this.storage.createDownloadUrl(target.storageKey, ttl, {
      contentType: target.mimeType,
      contentDisposition: target.disposition,
      cacheControl: `private, max-age=${ttl}`,
    });
  }

  /**
   * A link the browser can fetch without a session, for `<img src>` and the like: the signed
   * storage link, or without one a signed link to the API's own content route. `expiresAt` is the
   * time until which it works at least.
   */
  async createContentLink(target: MediaContentTarget): Promise<MediaContentLink> {
    // Taken before signing: a storage that signs a moment later lands in the same or a later
    // window, so its link lasts at least this long.
    const { expiresAt } = downloadUrlWindow(this.config.downloadUrlTtlSeconds);

    if (this.storage.supportsDirectDownload) {
      return { url: await this.createContentUrl(target), expiresAt };
    }

    const token = this.linkSigner.sign({
      mediaId: target.mediaId,
      kind: target.kind,
      expiresAt: expiresAt.getTime(),
    });

    return { url: `${API_BASE_PATH}/media/links/${token}`, expiresAt };
  }

  /**
   * The content behind a link of `createContentLink`; a damaged or expired link, or a file deleted
   * meanwhile, is a 404.
   */
  async openLinkedContent(
    token: string,
  ): Promise<{ target: MediaContentTarget; stream: Readable }> {
    const signed = this.linkSigner.verify(token);
    const file = signed ? await this.repository.findFileById(this.db, signed.mediaId) : null;

    if (!signed || !file) {
      throw new NotFoundError("Media not found");
    }

    const target = await this.resolveContentTarget(file, signed.kind ?? undefined);

    return { target, stream: await this.openContent(target) };
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

/** The variant a request names; without one the original. */
export function variantKindOf(
  variant: "thumbnail" | "display" | undefined,
): MediaVariantRow["kind"] | undefined {
  return variant === "thumbnail" ? "THUMBNAIL" : variant === "display" ? "DISPLAY" : undefined;
}

function contentDisposition(file: MediaFileRow, mimeType: string): string {
  const inline = mimeType.startsWith("image/") ? "inline" : "attachment";

  return `${inline}; filename="${normalizeFilename(file.originalName)}"`;
}

/** Headers for content the API streams itself; the caller adds `cache-control`. */
export function streamedContentHeaders(target: MediaContentTarget): Record<string, string> {
  return {
    "content-type": target.mimeType,
    "content-length": String(target.sizeBytes),
    "content-disposition": target.disposition,
    etag: `"${target.etag}"`,
    "x-content-type-options": "nosniff",
  };
}
