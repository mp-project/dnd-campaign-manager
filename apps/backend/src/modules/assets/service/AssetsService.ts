import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  VersionConflictError,
} from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import {
  type CreateAssetBaseDto,
  CreateAssetBaseSchema,
} from "#src/modules/assets/domain/dto/CreateAssetDto";
import type { UpdateAssetMetadataDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import type { AssetStatus } from "#src/modules/assets/domain/dto/BaseAssetDto";
import type { AssetView } from "#src/modules/assets/domain/dto/ResponseAssetDto";
import type {
  AssetRecord,
  AssetRow,
  AssetsRepository,
  UpdateAssetPatch,
} from "#src/modules/assets/domain/repository/AssetsRepository";

/**
 * Campaign facts the asset module needs; provided by the campaigns module.
 */
export type AssetCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db?: AppDatabase,
  ): Promise<{
    campaignId: string;
    rulesetId: string;
    role: "EDITOR" | "PLAYER" | null;
  } | null>;
};

/**
 * Supplies asset ids a player may see in a campaign (e.g. content shares, own characters).
 * Players see nothing unless at least one provider grants visibility.
 */
export type AssetVisibilityProvider = {
  name: string;
  listVisibleAssetIds(
    input: { campaignId: string; actorId: string },
    db: AppDatabase,
  ): Promise<string[]>;
};

export type CampaignAssetViewer = {
  actorId: string;
  campaignId: string;
  rulesetId: string;
  view: AssetView;
};

type AssetCommandInput = {
  actorId: string;
  assetId: string;
  expectedVersion: number;
};

const GM_CAMPAIGN_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];
const PLAYER_CAMPAIGN_STATUSES: readonly AssetStatus[] = ["ACTIVE"];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
}

function findErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const maybeCode = (error as { code?: unknown }).code;

  if (typeof maybeCode === "string") {
    return maybeCode;
  }

  return findErrorCode((error as { cause?: unknown }).cause);
}

/**
 * Shared identity, lifecycle and catalog resolution for all linkable content.
 *
 * Port methods taking a `db` handle are meant to be called by domain services inside their own
 * transaction; they do not check domain permissions, which remain the caller's responsibility.
 */
export class AssetsService {
  private readonly visibilityProviders: AssetVisibilityProvider[] = [];

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AssetsRepository,
    private readonly campaignAccess: AssetCampaignAccessPort,
  ) {}

  registerVisibilityProvider(provider: AssetVisibilityProvider): void {
    if (this.visibilityProviders.some((existing) => existing.name === provider.name)) {
      throw new Error(`Asset visibility provider '${provider.name}' is already registered`);
    }

    this.visibilityProviders.push(provider);
  }

  // ---------------------------------------------------------------------------
  // Port for domain modules
  // ---------------------------------------------------------------------------

  async createBase(
    db: AppDatabase,
    params: { actorId: string; campaignId: string | null },
    input: CreateAssetBaseDto,
  ): Promise<AssetRecord> {
    const data = CreateAssetBaseSchema.parse(input);
    const isSystem = params.campaignId === null;
    let rulesetIds: string[] = [];

    if (data.rulesetPolicy === "NEUTRAL" && data.rulesetIds?.length) {
      throw new ValidationError("Neutral assets cannot be restricted to rulesets");
    }

    if (isSystem) {
      rulesetIds = data.rulesetPolicy === "RESTRICTED" ? [...new Set(data.rulesetIds ?? [])] : [];
    } else {
      if (data.rulesetIds !== undefined) {
        throw new ValidationError("Campaign assets always use the campaign ruleset");
      }

      const campaign = await this.requireCampaign(db, params.campaignId as string, params.actorId);
      rulesetIds = data.rulesetPolicy === "RESTRICTED" ? [campaign.rulesetId] : [];
    }

    if (data.assetFamilyId) {
      await this.assertFamilyMatches(db, data.assetFamilyId, data.assetType);
    }

    const slug = data.slug ?? slugify(data.title);

    if (!slug) {
      throw new ValidationError("Asset slug cannot be derived from title");
    }

    const asset = await this.withConstraintErrors(() =>
      this.repository.create(db, {
        actorId: params.actorId,
        values: {
          assetType: data.assetType,
          title: data.title,
          slug,
          summary: data.summary ?? null,
          status: data.status,
          scope: isSystem ? "SYSTEM" : "CAMPAIGN",
          origin: isSystem ? "DEFAULT" : "CUSTOM",
          campaignId: params.campaignId,
          assetFamilyId: data.assetFamilyId ?? null,
          rulesetPolicy: data.rulesetPolicy,
          sourceReference: data.sourceReference ?? null,
        },
      }),
    );

    await this.withConstraintErrors(() =>
      this.repository.updateRulesets(db, {
        assetId: asset.id,
        actorId: params.actorId,
        rulesetIds,
      }),
    );
    await this.assertRestrictedHasRuleset(db, asset);

    return { asset, rulesetIds };
  }

  async updateMetadata(
    db: AppDatabase,
    params: AssetCommandInput & { patch: Omit<UpdateAssetMetadataDto, "expectedVersion"> },
  ): Promise<AssetRecord> {
    const current = await this.requireAsset(db, params.assetId);
    const { rulesetIds, ...fields } = params.patch;

    if (current.status === "ARCHIVED") {
      throw new ConflictError("Archived assets cannot be modified");
    }

    if (fields.assetFamilyId) {
      await this.assertFamilyMatches(db, fields.assetFamilyId, current.assetType);
    }

    if (current.scope === "CAMPAIGN" && rulesetIds !== undefined) {
      throw new ValidationError("Campaign assets always use the campaign ruleset");
    }

    const nextPolicy = fields.rulesetPolicy ?? current.rulesetPolicy;

    if (nextPolicy === "NEUTRAL" && rulesetIds?.length) {
      throw new ValidationError("Neutral assets cannot be restricted to rulesets");
    }

    const patch: UpdateAssetPatch = { ...fields };
    const updated = await this.withConstraintErrors(() =>
      this.repository.update(db, {
        assetId: params.assetId,
        actorId: params.actorId,
        expectedVersion: params.expectedVersion,
        patch,
      }),
    );

    if (!updated) {
      throw new VersionConflictError("Asset update version mismatch");
    }

    const nextRulesetIds = await this.resolveRulesetIdsForUpdate(db, {
      current,
      nextPolicy,
      rulesetIds,
      actorId: params.actorId,
    });

    if (nextRulesetIds) {
      await this.withConstraintErrors(() =>
        this.repository.updateRulesets(db, {
          assetId: updated.id,
          actorId: params.actorId,
          rulesetIds: nextRulesetIds,
        }),
      );
    }

    await this.assertRestrictedHasRuleset(db, updated);

    return this.toRecord(db, updated);
  }

  async archiveBase(db: AppDatabase, params: AssetCommandInput): Promise<AssetRecord> {
    const current = await this.requireAsset(db, params.assetId);

    if (current.status === "ARCHIVED") {
      throw new ConflictError("Asset is already archived");
    }

    return this.changeStatus(db, params, "ARCHIVED");
  }

  async restoreBase(db: AppDatabase, params: AssetCommandInput): Promise<AssetRecord> {
    const current = await this.requireAsset(db, params.assetId);

    if (current.status !== "ARCHIVED") {
      throw new ConflictError("Only archived assets can be restored");
    }

    return this.changeStatus(db, params, "ACTIVE");
  }

  /**
   * Loads an asset regardless of status, so archived definitions stay resolvable for existing usages.
   */
  async get(assetId: string, db: AppDatabase = this.db): Promise<AssetRecord | null> {
    const asset = await this.repository.findById(db, assetId);

    return asset ? this.toRecord(db, asset) : null;
  }

  /**
   * Asserts that an asset may be newly selected in a campaign: not archived, owned by the campaign
   * or global, and neutral or compatible with the campaign ruleset.
   */
  async assertAvailable(
    input: { assetId: string; campaignId: string; rulesetId: string },
    db: AppDatabase = this.db,
  ): Promise<AssetRecord> {
    const asset = await this.requireAsset(db, input.assetId);

    this.assertSameCampaign(asset, input.campaignId);

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived assets cannot be selected", { assetId: asset.id });
    }

    if (asset.scope === "SYSTEM" && asset.status !== "ACTIVE") {
      throw new NotFoundError("Asset not found");
    }

    if (!(await this.repository.isCompatible(db, asset.id, input.rulesetId))) {
      throw new ConflictError("Asset is not available for the campaign ruleset", {
        assetId: asset.id,
        rulesetId: input.rulesetId,
      });
    }

    return this.toRecord(db, asset);
  }

  /**
   * Rejects campaign assets that belong to another campaign (reported as 404 to avoid leaking ids).
   */
  assertSameCampaign(asset: AssetRow, campaignId: string): void {
    if (asset.scope === "CAMPAIGN" && asset.campaignId !== campaignId) {
      throw new NotFoundError("Asset not found");
    }
  }

  async resolveVariant(
    input: { assetFamilyId: string; rulesetId: string; campaignId?: string | null },
    db: AppDatabase = this.db,
  ): Promise<AssetRecord | null> {
    const [variant] = await this.repository.listFamilyVariants(db, {
      assetFamilyId: input.assetFamilyId,
      rulesetId: input.rulesetId,
      campaignId: input.campaignId ?? null,
    });

    return variant ? this.toRecord(db, variant) : null;
  }

  // ---------------------------------------------------------------------------
  // Access helpers for HTTP use cases
  // ---------------------------------------------------------------------------

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }

  /**
   * Resolves whether the actor sees a campaign as GM (admin, owner, editor) or player.
   * Non-members get 404 so campaign existence is not leaked.
   */
  async resolveCampaignViewer(
    context: RequestContext,
    campaignId: string,
  ): Promise<CampaignAssetViewer> {
    const actorId = this.assertAuthenticated(context);
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, this.db);
    const isAdmin = isSysAdminRole(context.systemRole);

    if (!campaign || (!campaign.role && !isAdmin)) {
      throw new NotFoundError("Campaign not found");
    }

    return {
      actorId,
      campaignId: campaign.campaignId,
      rulesetId: campaign.rulesetId,
      view: isAdmin || campaign.role === "EDITOR" ? "GM" : "PLAYER",
    };
  }

  async listVisibleAssetIds(viewer: CampaignAssetViewer): Promise<string[]> {
    const results = await Promise.all(
      this.visibilityProviders.map((provider) =>
        provider.listVisibleAssetIds(
          { campaignId: viewer.campaignId, actorId: viewer.actorId },
          this.db,
        ),
      ),
    );

    return [...new Set(results.flat())];
  }

  campaignStatusesFor(view: AssetView): readonly AssetStatus[] {
    return view === "GM" ? GM_CAMPAIGN_STATUSES : PLAYER_CAMPAIGN_STATUSES;
  }

  async requireAsset(db: AppDatabase, assetId: string): Promise<AssetRow> {
    const asset = await this.repository.findById(db, assetId);

    if (!asset) {
      throw new NotFoundError("Asset not found");
    }

    return asset;
  }

  async toRecord(db: AppDatabase, asset: AssetRow): Promise<AssetRecord> {
    const rulesetIds = await this.repository.listRulesetIds(db, [asset.id]);

    return { asset, rulesetIds: rulesetIds.get(asset.id) ?? [] };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async changeStatus(
    db: AppDatabase,
    params: AssetCommandInput,
    status: AssetStatus,
  ): Promise<AssetRecord> {
    const updated = await this.repository.update(db, {
      assetId: params.assetId,
      actorId: params.actorId,
      expectedVersion: params.expectedVersion,
      patch: { status },
    });

    if (!updated) {
      throw new VersionConflictError("Asset update version mismatch");
    }

    return this.toRecord(db, updated);
  }

  private async requireCampaign(db: AppDatabase, campaignId: string, actorId: string) {
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, db);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    return campaign;
  }

  private async assertFamilyMatches(
    db: AppDatabase,
    assetFamilyId: string,
    assetType: AssetRow["assetType"],
  ): Promise<void> {
    const family = await this.repository.findFamilyById(db, assetFamilyId);

    if (!family) {
      throw new NotFoundError("Asset family not found");
    }

    if (family.assetType !== assetType) {
      throw new ConflictError("Asset family belongs to a different asset type", {
        assetFamilyId,
        familyAssetType: family.assetType,
        assetType,
      });
    }
  }

  /**
   * Returns the ruleset ids to sync after a metadata update, or null when links stay unchanged.
   */
  private async resolveRulesetIdsForUpdate(
    db: AppDatabase,
    input: {
      current: AssetRow;
      nextPolicy: AssetRow["rulesetPolicy"];
      rulesetIds: string[] | undefined;
      actorId: string;
    },
  ): Promise<string[] | null> {
    const policyChanged = input.nextPolicy !== input.current.rulesetPolicy;

    if (input.nextPolicy === "NEUTRAL") {
      return policyChanged || input.rulesetIds !== undefined ? [] : null;
    }

    if (input.current.scope === "SYSTEM") {
      return input.rulesetIds ?? null;
    }

    if (!policyChanged) {
      return null;
    }

    const campaign = await this.requireCampaign(
      db,
      input.current.campaignId as string,
      input.actorId,
    );

    return [campaign.rulesetId];
  }

  private async assertRestrictedHasRuleset(db: AppDatabase, asset: AssetRow): Promise<void> {
    if (asset.rulesetPolicy !== "RESTRICTED") {
      return;
    }

    if ((await this.repository.countActiveRulesets(db, asset.id)) === 0) {
      throw new ValidationError("Restricted assets require at least one ruleset");
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("Asset slug is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced ruleset, campaign or asset family not found");
      }

      throw error;
    }
  }
}
