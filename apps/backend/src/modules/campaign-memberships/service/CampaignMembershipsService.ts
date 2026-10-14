import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  VersionConflictError,
} from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import { CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS } from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import type { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import type { CreateCampaignMembershipDto } from "#src/modules/campaign-memberships/domain/dto/CreateCampaignMembershipDto";
import type { UpdateCampaignMembershipRoleDto } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

export class CampaignMembershipsService {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: CampaignMembershipsRepository,
    private readonly campaignsService: CampaignsService,
    private readonly usersDependencies: UsersModuleDependencies,
  ) {}

  async listMembers(context: RequestContext, campaignId: string) {
    const { campaign, membership, actorId } = await this.getAccess(context, campaignId);

    if (
      !isSysAdminRole(context.systemRole) &&
      campaign.ownerUserId !== actorId &&
      !membership
    ) {
      throw new NotFoundError("Campaign not found");
    }

    const canManage =
      isSysAdminRole(context.systemRole) ||
      campaign.ownerUserId === actorId ||
      membership?.role === "EDITOR";

    const memberships = await this.repository.listActiveByCampaign(this.db, campaignId);
    const summaries = await this.usersDependencies.service.listPublicSummaries(
      memberships.map((membership) => membership.userId),
    );
    const summaryByUserId = new Map(summaries.map((summary) => [summary.id, summary]));

    return {
      members: memberships.flatMap((membership) => {
        const user = summaryByUserId.get(membership.userId);

        return user
          ? [{ membership, userId: user.id, userTag: user.userTag, displayName: user.displayName }]
          : [];
      }),
      canManage,
    };
  }

  async getMyPermissions(context: RequestContext, campaignId: string): Promise<string[]> {
    const { campaign, membership, actorId } = await this.getAccess(context, campaignId);

    if (
      !isSysAdminRole(context.systemRole) &&
      campaign.ownerUserId !== actorId &&
      !membership
    ) {
      throw new NotFoundError("Campaign not found");
    }

    if (
      isSysAdminRole(context.systemRole) ||
      campaign.ownerUserId === actorId ||
      membership?.role === "EDITOR"
    ) {
      return [...CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS];
    }

    return [CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[0]];
  }

  async createPendingMembership(
    context: RequestContext,
    input: { campaignId: string } & CreateCampaignMembershipDto,
  ) {
    const actorId = await this.assertCanManage(context, input.campaignId);
    const target = await this.usersDependencies.useCases.getOneUserBy.execute({
      userId: input.userId,
    });

    if (!target) {
      throw new NotFoundError("User not found");
    }

    try {
      return await this.repository.createPending(this.db, {
        actorId,
        ...input,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError("User already has an active or pending membership");
      }

      throw error;
    }
  }

  async activateFromInvitation(input: {
    campaignId: string;
    userId: string;
    actorId: string;
  }) {
    if (input.actorId !== input.userId) {
      throw new ForbiddenError("Only the invited user can activate this membership");
    }

    const user = await this.usersDependencies.useCases.getOneUserBy.execute({
      userId: input.userId,
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const activated = await this.repository.activatePending(this.db, input);

    if (!activated) {
      throw new NotFoundError("Pending campaign membership not found");
    }

    return activated;
  }

  async getActiveByUser(campaignId: string, userId: string, db: AppDatabase = this.db) {
    return this.repository.findActiveByUser(db, campaignId, userId);
  }

  createActiveFromInvitation(
    db: AppDatabase,
    input: { actorId: string; campaignId: string; userId: string; role: "EDITOR" | "PLAYER" },
  ) {
    return this.repository.createActiveFromInvitation(db, input);
  }

  async changeRole(
    context: RequestContext,
    campaignId: string,
    memberId: string,
    input: UpdateCampaignMembershipRoleDto,
  ) {
    return this.transactionManager.inTransaction(async (tx) => {
      await this.campaignsService.lockCampaign(tx, campaignId);
      const actorId = await this.assertCanManage(context, campaignId, tx);

      const member = await this.repository.findById(tx, campaignId, memberId);

      if (!member || member.status !== "ACTIVE") {
        throw new NotFoundError("Campaign member not found");
      }

      const campaign = await this.campaignsService.findMembershipCampaign(tx, campaignId);

      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }

      if (member.userId === campaign.ownerUserId && input.role !== "EDITOR") {
        throw new ConflictError("Campaign owner must remain an editor");
      }

      if (member.role === "EDITOR" && input.role !== "EDITOR") {
        const editorCount = await this.repository.countActiveEditors(tx, campaignId);

        if (editorCount <= 1) {
          throw new ConflictError("Campaign must retain at least one active editor");
        }
      }

      const updated = await this.repository.updateRole(tx, {
        campaignId,
        membershipId: memberId,
        actorId,
        expectedVersion: input.expectedVersion,
        role: input.role,
      });

      if (!updated) {
        throw new VersionConflictError("Campaign membership version mismatch");
      }

      return updated;
    });
  }

  async revoke(context: RequestContext, campaignId: string, memberId: string) {
    return this.transactionManager.inTransaction(async (tx) => {
      await this.campaignsService.lockCampaign(tx, campaignId);
      const actorId = await this.assertCanManage(context, campaignId, tx);

      const member = await this.repository.findById(tx, campaignId, memberId);

      if (!member || member.status !== "ACTIVE") {
        throw new NotFoundError("Campaign member not found");
      }

      const campaign = await this.campaignsService.findMembershipCampaign(tx, campaignId);

      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }

      if (member.userId === campaign.ownerUserId) {
        throw new ConflictError("Campaign owner cannot be removed");
      }

      if (member.role === "EDITOR" && (await this.repository.countActiveEditors(tx, campaignId)) <= 1) {
        throw new ConflictError("Campaign must retain at least one active editor");
      }

      const revoked = await this.repository.revoke(tx, {
        campaignId,
        membershipId: memberId,
        actorId,
      });

      if (!revoked) {
        throw new VersionConflictError("Campaign membership changed concurrently");
      }

      return revoked;
    });
  }

  async buildCampaignContext(campaignId: string, actorId: string | null) {
    const campaign = await this.campaignsService.findMembershipCampaign(this.db, campaignId);

    if (!campaign) {
      return null;
    }

    const membership = actorId
      ? await this.repository.findActiveByUser(this.db, campaignId, actorId)
      : null;

    return {
      campaignId,
      rulesetId: campaign.rulesetId,
      campaignMemberId: membership?.id ?? null,
      membershipActive: actorId === campaign.ownerUserId || Boolean(membership),
    };
  }

  private async assertCanManage(
    context: RequestContext,
    campaignId: string,
    db: AppDatabase = this.db,
  ): Promise<string> {
    const { campaign, membership, actorId } = await this.getAccess(context, campaignId, db);

    if (
      !isSysAdminRole(context.systemRole) &&
      campaign.ownerUserId !== actorId &&
      membership?.role !== "EDITOR"
    ) {
      throw new NotFoundError("Campaign not found");
    }

    return actorId;
  }

  private async getAccess(
    context: RequestContext,
    campaignId: string,
    db: AppDatabase = this.db,
  ) {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    const actor = await this.usersDependencies.useCases.getOneUserBy.execute({
      userId: context.actorId,
    });

    if (!actor) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    const campaign = await this.campaignsService.findMembershipCampaign(db, campaignId);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.repository.findActiveByUser(db, campaignId, context.actorId);

    return { actorId: actor.id, campaign, membership };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }
}
