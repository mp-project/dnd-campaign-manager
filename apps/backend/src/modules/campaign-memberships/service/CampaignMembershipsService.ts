import { NotFoundError, UnauthenticatedError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CampaignMember } from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipDto";
import type {
  CampaignMembershipRow,
  CampaignMembershipsRepository,
} from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";
import type { CampaignAccessFacts } from "#core/app/container";

export type CreateCampaignMembershipInput = {
  campaignId: string;
  userId: string;
  role: CampaignMembershipRow["role"];
};

/**
 * Shared membership logic for the use cases (access checks, member lookups) and the port used by
 * other modules (active membership lookup, membership creation, campaign context).
 */
export class CampaignMembershipsService {
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: CampaignMembershipsRepository,
    private readonly campaignsService: CampaignsService,
    private readonly usersDependencies: UsersModuleDependencies,
  ) {}

  get trackedMembership() {
    return this.campaignsService.trackedMembership;
  }

  /**
   * Resolves the actor's access to a campaign; non-members get a 404 so the campaign stays hidden.
   */
  async resolveMemberAccess(
    context: RequestContext,
    campaignId: string,
  ): Promise<{ actorId: string; canManage: boolean }> {
    const actorId = await this.requireActorId(context);
    const { campaign, membership } = await this.getAccess(actorId, campaignId);

    if (
      !isSysAdminRole(context.systemRole) &&
      campaign.ownerUserId !== actorId &&
      !membership
    ) {
      throw new NotFoundError("Campaign not found");
    }

    return {
      actorId,
      canManage:
        isSysAdminRole(context.systemRole) ||
        campaign.ownerUserId === actorId ||
        membership?.role === "EDITOR",
    };
  }

  /**
   * Resolves the authenticated actor through the users module, which uses its own connection.
   * Call this before opening a transaction: waiting for a second connection while holding the
   * campaign lock can exhaust the pool and block every request.
   */
  async requireActorId(context: RequestContext): Promise<string> {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
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
   * Locks the campaign and checks management access, so the checks on its members stay valid until
   * the commit. Must run inside a transaction, after `requireActorId`.
   */
  async lockForManagement(
    tx: AppDatabase,
    context: RequestContext,
    campaignId: string,
  ): Promise<void> {
    await this.campaignsService.lockCampaign(tx, campaignId);
    await this.assertCanManage(context, context.actorId as string, campaignId, tx);
  }

  /**
   * Loads the active member and the campaign. Must run after `lockForManagement`.
   */
  async loadManagedMember(tx: AppDatabase, campaignId: string, memberId: string) {
    const member = await this.repository.findById(tx, campaignId, memberId);

    if (!member || member.status !== "ACTIVE") {
      throw new NotFoundError("Campaign member not found");
    }

    const campaign = await this.campaignsService.findMembershipCampaign(tx, campaignId);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    return { member, campaign };
  }

  async listMembers(campaignId: string): Promise<CampaignMember[]> {
    const memberships = await this.repository.listActiveByCampaign(this.db, campaignId);
    const summaries = await this.usersDependencies.service.listPublicSummaries(
      memberships.map((membership) => membership.userId),
    );
    const summaryByUserId = new Map(summaries.map((summary) => [summary.id, summary]));

    return memberships.flatMap((membership) => {
      const user = summaryByUserId.get(membership.userId);

      return user ? [{ membership, userTag: user.userTag, displayName: user.displayName }] : [];
    });
  }

  async getActiveByUser(campaignId: string, userId: string, db: AppDatabase = this.db) {
    return this.repository.findActiveByUser(db, campaignId, userId);
  }

  createActiveFromInvitation(scope: ActionScope, input: CreateCampaignMembershipInput) {
    return scope.create(this.trackedMembership, input);
  }

  async buildCampaignContext(
    campaignId: string,
    actorId: string | null,
  ): Promise<CampaignAccessFacts | null> {
    const campaign = await this.campaignsService.findMembershipCampaign(this.db, campaignId);

    if (!campaign) {
      return null;
    }

    const membership = actorId
      ? await this.repository.findActiveByUser(this.db, campaignId, actorId)
      : null;
    const isOwner = actorId !== null && actorId === campaign.ownerUserId;

    return {
      campaignId,
      rulesetId: campaign.rulesetId,
      campaignMemberId: membership?.id ?? null,
      membershipActive: isOwner || Boolean(membership),
      campaignRole: isOwner ? "OWNER" : (membership?.role ?? null),
    };
  }

  private async assertCanManage(
    context: RequestContext,
    actorId: string,
    campaignId: string,
    db: AppDatabase,
  ): Promise<void> {
    const { campaign, membership } = await this.getAccess(actorId, campaignId, db);

    if (
      !isSysAdminRole(context.systemRole) &&
      campaign.ownerUserId !== actorId &&
      membership?.role !== "EDITOR"
    ) {
      throw new NotFoundError("Campaign not found");
    }
  }

  private async getAccess(actorId: string, campaignId: string, db: AppDatabase = this.db) {
    const campaign = await this.campaignsService.findMembershipCampaign(db, campaignId);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.repository.findActiveByUser(db, campaignId, actorId);

    return { campaign, membership };
  }
}
