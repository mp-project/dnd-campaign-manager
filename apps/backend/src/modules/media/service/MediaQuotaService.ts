import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import { StorageError, type StoragePort } from "#core/storage/index";
import {
  applyMediaLimitOverrides,
  type MediaLimits,
  type MediaLimitsProvider,
  toMediaCategory,
} from "#src/modules/media/domain/MediaLimits";
import type {
  CampaignOwner,
  MediaRepository,
} from "#src/modules/media/domain/repository/MediaRepository";

export type MediaStorageUsage = {
  usedBytes: number;
  totalBytes: number;
};

/**
 * Limits of a campaign: the defaults, unless a provider replaces them. They only apply to S3, where
 * most files end up. Only administrators and the campaign owner get to see the numbers.
 */
export class MediaQuotaService {
  private limitsProvider: MediaLimitsProvider | null = null;

  constructor(
    private readonly db: AppDatabase,
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
  ) {}

  registerLimitsProvider(provider: MediaLimitsProvider): void {
    if (this.limitsProvider) {
      throw new Error("A media limits provider is already registered");
    }

    this.limitsProvider = provider;
  }

  /** May use its own connection, so call it before opening a transaction. */
  async findLimits(campaignId: string): Promise<MediaLimits> {
    return applyMediaLimitOverrides(
      (await this.limitsProvider?.findOverrides(campaignId)) ?? null,
    );
  }

  maySeeUsage(owner: CampaignOwner, viewer: Pick<RequestContext, "actorId" | "systemRole">): boolean {
    return owner.ownerUserId === viewer.actorId || isSysAdminRole(viewer.systemRole);
  }

  /** Null for everybody else, and if no limits apply, because there is nothing to display then. */
  async findVisibleUsage(
    context: RequestContext,
    campaignId: string,
  ): Promise<MediaStorageUsage | null> {
    if (!this.limitsApply) {
      return null;
    }

    const owner = await this.repository.findCampaignOwner(this.db, campaignId);

    if (!owner || !this.maySeeUsage(owner, context)) {
      return null;
    }

    const { totalBytes } = await this.findLimits(campaignId);

    return {
      usedBytes: await this.repository.sumCampaignUsage(this.db, campaignId, new Date()),
      totalBytes,
    };
  }

  /** Everybody else only learns that the file doesn't fit, not the numbers behind it. */
  async assertWithinLimits(
    db: AppDatabase,
    upload: {
      campaignId: string;
      limits: MediaLimits;
      mimeType: string;
      sizeBytes: number;
      now: Date;
      revealLimits: boolean;
    },
  ): Promise<void> {
    if (!this.limitsApply) {
      return;
    }

    const { limits } = upload;
    const category = toMediaCategory(upload.mimeType);
    const maxBytes = limits.maxFileBytes[category];

    if (upload.sizeBytes > maxBytes) {
      throw new StorageError("MAX_UPLOAD_SIZE_EXCEEDED", "The file is too large for this campaign", {
        statusCode: 413,
        ...(upload.revealLimits ? { details: { category, maxBytes } } : {}),
      });
    }

    const usedBytes = await this.repository.sumCampaignUsage(db, upload.campaignId, upload.now);

    if (usedBytes + upload.sizeBytes > limits.totalBytes) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", "The storage of this campaign is full", {
        statusCode: 413,
        ...(upload.revealLimits ? { details: { usedBytes, totalBytes: limits.totalBytes } } : {}),
      });
    }
  }

  private get limitsApply(): boolean {
    return this.storage.driver === "s3";
  }
}
