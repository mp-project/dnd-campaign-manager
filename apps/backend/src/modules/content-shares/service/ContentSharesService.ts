
import type { ContentViewer } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  VersionConflictError,
} from "#core/error/http/index";
import type { AssetUsageItemDto } from "#src/modules/asset-links/index";
import type {
  AssetRow,
  AssetsService,
  AssetType,
} from "#src/modules/assets/index";
import type { CreateContentShareDto } from "#src/modules/content-shares/domain/dto/CreateContentShareDto";
import type { UpdateContentShareDto } from "#src/modules/content-shares/domain/dto/UpdateContentShareDto";
import { audienceMatchesRecipients } from "#src/modules/content-shares/domain/dto/BaseContentShareDto";
import type {
  ContentShareRow,
  ContentSharesRepository,
  ReceivedShareRow,
} from "#src/modules/content-shares/domain/repository/ContentSharesRepository";

/** Memberships of a campaign; provided by the campaign-memberships module. */
export type ShareMembershipPort = {
  findById(
    db: AppDatabase,
    campaignId: string,
    membershipId: string,
  ): Promise<{ id: string; role: "EDITOR" | "PLAYER"; status: string } | null>;
  findActiveByUser(
    db: AppDatabase,
    campaignId: string,
    userId: string,
  ): Promise<{ id: string; role: "EDITOR" | "PLAYER" } | null>;
  listActiveByCampaign(
    db: AppDatabase,
    campaignId: string,
  ): Promise<{ id: string; role: "EDITOR" | "PLAYER" }[]>;
};

type SharePath = { campaignId: string; shareId: string };

/**
 * Reveals of campaign content to players. Shares are no content, so they bypass the history; a
 * share that ends is deleted.
 */
export class ContentSharesService {
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: ContentSharesRepository,
    private readonly assets: AssetsService,
    private readonly memberships: ShareMembershipPort,
  ) {}

  /**
   * Story content can be shared (`kind: "STORY"` in its content type, with its player view);
   * nothing else. The module decides what players see: only what its player view schema describes
   * reaches them.
   */
  isShareable(assetType: AssetType): boolean {
    return this.storyType(assetType) !== undefined;
  }

  private storyType(assetType: AssetType) {
    const type = this.assets.getContentType(assetType);

    return type?.kind === "STORY" ? type : undefined;
  }

  // ---------------------------------------------------------------------------
  // Visibility for other modules
  // ---------------------------------------------------------------------------

  /**
   * Assets shared with this actor as an active player. Types that are no longer shareable grant
   * nothing, so a module stays in control of its content.
   */
  async listVisibleAssetIds(
    input: { campaignId: string; actorId: string },
    db: AppDatabase = this.db,
  ): Promise<string[]> {
    const received = await this.listReceived(input, db);
    const assets = await this.assets.findMany(
      received.map(({ share }) => share.assetId),
      db,
    );

    return [...assets.values()]
      .filter((asset) => this.isShareable(asset.assetType))
      .map((asset) => asset.id);
  }

  /** Shares reaching the actor; empty unless the actor is an active player. */
  async listReceived(
    input: { campaignId: string; actorId: string },
    db: AppDatabase = this.db,
  ): Promise<ReceivedShareRow[]> {
    const membership = await this.memberships.findActiveByUser(db, input.campaignId, input.actorId);

    if (membership?.role !== "PLAYER") {
      return [];
    }

    return this.repository.listReceived(db, {
      campaignId: input.campaignId,
      memberId: membership.id,
    });
  }

  /** Usage group `shares`. Players only learn about a share that reaches them. */
  async listUsages(
    input: { assetId: string; campaignId: string; actorId?: string },
    db: AppDatabase = this.db,
  ): Promise<AssetUsageItemDto[]> {
    const shares = (await this.repository.findByAsset(db, input.assetId)).filter(
      (share) => share.campaignId === input.campaignId,
    );
    const visible =
      input.actorId === undefined
        ? shares
        : (await this.listReceived({ campaignId: input.campaignId, actorId: input.actorId }, db))
            .map(({ share }) => share)
            .filter((share) => share.assetId === input.assetId);
    const asset = (await this.assets.findMany([input.assetId], db)).get(input.assetId);

    return visible.map((share) => ({
      id: share.id,
      type: "CONTENT_SHARE",
      label: input.actorId === undefined ? share.audience : null,
      assetId: share.assetId,
      assetType: asset?.assetType ?? null,
      editRoute: `/campaigns/${share.campaignId}/shares/${share.id}`,
    }));
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireShare(db: AppDatabase, path: SharePath): Promise<ContentShareRow> {
    const share = await this.repository.findById(db, path.shareId);

    if (!share || share.campaignId !== path.campaignId) {
      throw new NotFoundError("Share not found");
    }

    return share;
  }

  /** Recipients that are still active players; a removed member no longer counts. */
  async listActiveRecipients(
    campaignId: string,
    shareIds: readonly string[],
    db: AppDatabase = this.db,
  ): Promise<Map<string, string[]>> {
    const [recipients, members] = await Promise.all([
      this.repository.listRecipientIds(db, shareIds),
      this.memberships.listActiveByCampaign(db, campaignId),
    ]);
    const players = new Set(members.filter((member) => member.role === "PLAYER").map((m) => m.id));

    return new Map(
      [...recipients].map(([shareId, ids]) => [shareId, ids.filter((id) => players.has(id))]),
    );
  }

  /**
   * The shared assets a share still reveals: active, of a shareable type, of the campaign or
   * global. A share grants the asset itself, so no other grant is needed.
   */
  async findVisibleAsset(
    viewer: Pick<ContentViewer, "campaignId">,
    assetIds: readonly string[],
  ): Promise<Map<string, AssetRow>> {
    const assets = await this.assets.findMany(assetIds);

    return new Map(
      [...assets].filter(
        ([, asset]) =>
          (asset.campaignId === null || asset.campaignId === viewer.campaignId) &&
          this.isShareable(asset.assetType) &&
          asset.status === "ACTIVE",
      ),
    );
  }

  /**
   * The shared content as the owning module shows it to players. Editors get the same view as a
   * preview of what their players see.
   */
  async loadSharedContent(
    viewer: Pick<ContentViewer, "actorId" | "campaignId" | "view">,
    shareId: string,
  ): Promise<{ share: ContentShareRow; asset: AssetRow; content: unknown }> {
    const share =
      viewer.view === "FULL"
        ? await this.requireShare(this.db, { campaignId: viewer.campaignId, shareId })
        : (await this.listReceived(viewer)).find((item) => item.share.id === shareId)?.share;
    const asset = share
      ? (await this.findVisibleAsset(viewer, [share.assetId])).get(share.assetId)
      : undefined;
    const definition = asset ? this.storyType(asset.assetType) : undefined;

    if (!share || !asset || !definition) {
      throw new NotFoundError("Share not found");
    }

    const loaded = await definition.playerView.load(
      { campaignId: viewer.campaignId, assetId: asset.id, actorId: viewer.actorId },
      this.db,
    );
    const parsed = definition.playerView.schema.safeParse(loaded);

    // A module error, not a client error; nothing of the loaded content leaves the server.
    if (!parsed.success) {
      throw new Error(`Player content of '${asset.assetType}' does not match its schema`);
    }

    return { share, asset, content: parsed.data };
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Deletes the expired shares of a campaign. Call it before a transaction: inside one, a refused
   * request would roll the deletion back.
   */
  async deleteExpired(campaignId: string): Promise<void> {
    await this.repository.deleteExpired(this.db, campaignId);
  }

  /** One share per asset; a second one is a conflict, the existing one can be changed. */
  async createShare(
    tx: AppDatabase,
    params: { actorId: string; campaignId: string; rulesetId: string },
    input: CreateContentShareDto,
  ): Promise<ContentShareRow> {
    // Own content of the campaign, or global content that fits its ruleset. Players see global
    // content anyway; sharing it draws their attention to it.
    const { asset } = await this.assets.assertAvailable(
      { assetId: input.assetId, campaignId: params.campaignId, rulesetId: params.rulesetId },
      tx,
    );

    await this.assertShareable(asset, tx);
    this.assertFuture(input.expiresAt);

    const recipients = input.recipientMemberIds ?? [];

    await this.assertRecipients(tx, params.campaignId, recipients);

    const share = await this.withConstraintErrors(() =>
      this.repository.create(tx, {
        campaignId: params.campaignId,
        assetId: asset.id,
        audience: input.audience,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: params.actorId,
      }),
    );

    await this.repository.replaceRecipients(tx, {
      shareId: share.id,
      memberIds: recipients,
      actorId: params.actorId,
    });

    return share;
  }

  /**
   * Version check without merging, because a share has no history to merge against. Becoming a
   * share for all players counts as a new reveal.
   */
  async updateShare(
    tx: AppDatabase,
    params: SharePath & { actorId: string; command: UpdateContentShareDto },
  ): Promise<ContentShareRow> {
    const current = await this.requireShare(tx, params);
    const { expectedVersion, ...patch } = params.command;
    const audience = patch.audience ?? current.audience;
    const recipients =
      patch.recipientMemberIds ??
      (audience === current.audience
        ? ((await this.repository.listRecipientIds(tx, [current.id])).get(current.id) ?? [])
        : []);

    if (!audienceMatchesRecipients({ audience, recipientMemberIds: recipients })) {
      throw new ValidationError("All players take no recipients, selected players at least one");
    }

    this.assertFuture(patch.expiresAt);
    await this.assertRecipients(tx, params.campaignId, recipients);

    const asset = await this.assets.requireAsset(tx, current.assetId);

    await this.assertShareable(asset, tx);

    const values: Parameters<ContentSharesRepository["update"]>[1]["values"] = {};

    if (patch.audience !== undefined) {
      values.audience = patch.audience;

      if (patch.audience === "ALL_PLAYERS" && current.audience !== "ALL_PLAYERS") {
        values.sharedAt = new Date();
      }
    }

    if (patch.expiresAt !== undefined) {
      values.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    }

    const updated = await this.repository.update(tx, {
      shareId: current.id,
      expectedVersion,
      values,
      actorId: params.actorId,
    });

    if (!updated) {
      throw new VersionConflictError("The share was changed by someone else", {
        currentVersion: current.version,
        conflicts: [],
      });
    }

    await this.repository.replaceRecipients(tx, {
      shareId: updated.id,
      memberIds: recipients,
      actorId: params.actorId,
    });

    return updated;
  }

  /**
   * Ends every share of an asset, for modules whose content must not be shown again on its own,
   * for example after archiving. Runs in the caller's transaction.
   */
  async endSharesOfAsset(tx: AppDatabase, assetId: string): Promise<void> {
    await this.repository.deleteByAsset(tx, assetId);
  }

  /** Ending a share deletes it; the content itself stays as it is. */
  async revokeShare(tx: AppDatabase, path: SharePath): Promise<void> {
    await this.requireShare(tx, path);

    // A parallel revoke may have deleted it after the lookup.
    if (!(await this.repository.delete(tx, path.shareId))) {
      throw new NotFoundError("Share not found");
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async assertShareable(asset: AssetRow, db: AppDatabase): Promise<void> {
    const definition = this.storyType(asset.assetType);

    if (!definition) {
      throw new ConflictError("This content type cannot be shared", {
        assetType: asset.assetType,
      });
    }

    if (asset.status !== "ACTIVE") {
      throw new ConflictError("Only active content can be shared", { status: asset.status });
    }

    await definition.assertShareable?.(asset, db);
  }

  private assertFuture(expiresAt: string | null | undefined): void {
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new ValidationError("The end of a share must lie in the future");
    }
  }

  /** Only active players of the campaign; editors see everything anyway. */
  private async assertRecipients(
    db: AppDatabase,
    campaignId: string,
    memberIds: readonly string[],
  ): Promise<void> {
    const invalid: string[] = [];

    for (const memberId of memberIds) {
      const member = await this.memberships.findById(db, campaignId, memberId);

      if (member?.status !== "ACTIVE" || member.role !== "PLAYER") {
        invalid.push(memberId);
      }
    }

    if (invalid.length > 0) {
      throw new ConflictError("Recipients must be active players of this campaign", {
        recipientMemberIds: invalid,
      });
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (findPgErrorCode(error) === "23505") {
        throw new ConflictError("This content is already shared; change the existing share");
      }

      throw error;
    }
  }
}
