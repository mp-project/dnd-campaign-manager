import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { CampaignContext, RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { PermissionService } from "#core/permissions/service";
import {
  type CampaignAggregate,
  type CampaignMembershipRow,
  type CampaignRow,
  CampaignsRepository,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import {
  createTrackedCampaign,
  type TrackedCampaign,
} from "#src/modules/campaigns/history/TrackedCampaign";
import type { RulesetModuleDependencies } from "#src/modules/ruleset/index";
import type { UsersModuleDependencies } from "#src/modules/users/index";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LoadedCampaign = {
  campaign: CampaignRow;
  membership: CampaignMembershipRow | null;
};

function toCampaignContext(context: RequestContext, campaign: CampaignRow): CampaignContext {
  return {
    actorId: context.actorId,
    systemRole: context.systemRole,
    campaignId: campaign.id,
    rulesetId: campaign.rulesetId,
    campaignMemberId: null,
    permissions: [],
  };
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export class CampaignsService {
  public readonly trackedCampaign: TrackedCampaign;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: CampaignsRepository,
    public readonly usersDependencies: UsersModuleDependencies,
    public readonly rulesetDependencies: RulesetModuleDependencies,
    public readonly permissionService?: PermissionService,
  ) {
    this.trackedCampaign = createTrackedCampaign({
      resolveRole: async (campaignId, actorId, db) => {
        const campaign = await this.findCampaignRole(campaignId, actorId, db);

        return campaign?.isOwner ? "GM" : (campaign?.role ?? null);
      },
    });
  }

  async resolveCampaignAccess(input: {
    campaignId: string;
    actorId: string | null;
  }): Promise<{
    campaignId: string;
    rulesetId: string;
    campaignMemberId: string | null;
    membershipActive: boolean;
  } | null> {
    return this.repository.resolveCampaignAccess({
      db: this.db,
      campaignId: input.campaignId,
      actorId: input.actorId,
    });
  }

  findMembershipCampaign(db: AppDatabase, campaignId: string) {
    return this.repository.findMembershipCampaign(db, campaignId);
  }

  /**
   * Resolves the campaign and the actor's campaign role for cross-module access checks.
   * The owner counts as EDITOR; inactive memberships yield `role: null`.
   */
  async findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase = this.db,
  ): Promise<{
    campaignId: string;
    rulesetId: string;
    role: "EDITOR" | "PLAYER" | null;
    isOwner: boolean;
  } | null> {
    const campaign = await this.repository.findMembershipCampaign(db, campaignId);

    if (!campaign) {
      return null;
    }

    if (campaign.ownerUserId === actorId) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        role: "EDITOR",
        isOwner: true,
      };
    }

    const membership = await this.repository.findMembership(db, campaignId, actorId);

    return {
      campaignId: campaign.id,
      rulesetId: campaign.rulesetId,
      role: membership?.role ?? null,
      isOwner: false,
    };
  }

  lockCampaign(db: AppDatabase, campaignId: string): Promise<void> {
    return this.repository.lockCampaign(db, campaignId);
  }

  /**
   * Resolves the authenticated actor through the users module, which uses its own connection.
   * Call this before opening a transaction.
   */
  async requireActorId(context: RequestContext): Promise<string> {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    if (!uuidPattern.test(context.actorId)) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    const actor = await this.usersDependencies.useCases.getOneUserBy.execute({
      userId: context.actorId,
    });

    if (!actor) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    return actor.id;
  }

  /**
   * Loads a campaign the actor may read: owner, active member or system admin.
   * Anyone else gets a 404 so the campaign stays hidden.
   */
  async loadReadableCampaign(
    context: RequestContext,
    actorId: string,
    campaignId: string,
  ): Promise<LoadedCampaign> {
    const loaded = await this.loadCampaign(actorId, campaignId);

    if (!loaded.membership && !this.isOwnerOrAdmin(context, actorId, loaded.campaign)) {
      throw new NotFoundError("Campaign not found");
    }

    return loaded;
  }

  /**
   * Loads a campaign the actor may change: owner or system admin.
   * Anyone else gets a 404 so the campaign stays hidden.
   */
  async loadManagedCampaign(
    context: RequestContext,
    actorId: string,
    campaignId: string,
  ): Promise<LoadedCampaign> {
    const loaded = await this.loadCampaign(actorId, campaignId);

    if (!this.isOwnerOrAdmin(context, actorId, loaded.campaign)) {
      throw new NotFoundError("Campaign not found");
    }

    return loaded;
  }

  /**
   * Rights check inside an action: owner or system admin, using the action's transaction.
   * Anyone else gets a 404 so the campaign stays hidden.
   */
  async assertCanManage(
    context: RequestContext,
    campaignId: string,
    db: AppDatabase,
  ): Promise<void> {
    const campaign = await this.repository.findById(db, campaignId);

    if (!campaign || !this.isOwnerOrAdmin(context, context.actorId as string, campaign)) {
      throw new NotFoundError("Campaign not found");
    }
  }

  async toAggregate(
    db: AppDatabase,
    context: RequestContext,
    campaign: CampaignRow,
  ): Promise<CampaignAggregate> {
    const membership = await this.repository.findMembership(
      db,
      campaign.id,
      context.actorId as string,
    );

    return this.buildAggregate(context, campaign, membership);
  }

  async withSlugConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError("Campaign slug is already in use for this owner");
      }

      throw error;
    }
  }

  assertNotArchived(campaign: Pick<CampaignRow, "status">): void {
    if (campaign.status === "ARCHIVED") {
      throw new ConflictError("Archived campaigns cannot be modified");
    }
  }

  buildAggregate(
    context: RequestContext,
    campaign: CampaignRow,
    membership: CampaignMembershipRow | null,
  ): CampaignAggregate {
    return this.attachEffectivePermissions(context, {
      campaign,
      membership,
      isOwner: false,
      effectivePermissions: [],
    });
  }

  attachEffectivePermissions(
    context: RequestContext,
    aggregate: CampaignAggregate,
  ): CampaignAggregate {
    if (!this.permissionService) {
      return aggregate;
    }

    const isOwner = aggregate.campaign.ownerUserId === context.actorId;

    const campaignContext = toCampaignContext(context, aggregate.campaign);
    campaignContext.campaignMemberId = aggregate.membership?.id ?? null;

    const effectivePermissions = this.permissionService.listEffectivePermissions(campaignContext);

    return {
      ...aggregate,
      isOwner,
      effectivePermissions,
    };
  }

  slugify(input: string): string {
    return slugify(input);
  }

  isUniqueViolation(error: unknown): boolean {
    return findErrorCode(error) === "23505";
  }

  private async loadCampaign(actorId: string, campaignId: string): Promise<LoadedCampaign> {
    const campaign = await this.repository.findById(this.db, campaignId);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.repository.findMembership(this.db, campaignId, actorId);

    return { campaign, membership };
  }

  private isOwnerOrAdmin(
    context: RequestContext,
    actorId: string,
    campaign: CampaignRow,
  ): boolean {
    return campaign.ownerUserId === actorId || isSysAdminRole(context.systemRole);
  }
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
