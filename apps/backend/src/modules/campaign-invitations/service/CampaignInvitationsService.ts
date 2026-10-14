import { createHash, randomBytes } from "node:crypto";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { EmailPort } from "#core/email/index";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CreateCampaignInvitationDto } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  buildCampaignInvitationAcceptUrl,
  renderCampaignInvitationEmail,
} from "#src/modules/campaign-invitations/email/CampaignInvitationEmailTemplate";
import type { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import type { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

type CampaignInvitationTarget = { email: string; userId: string | null; userTag: string | null };

export class CampaignInvitationsService {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: CampaignInvitationsRepository,
    private readonly campaignsService: CampaignsService,
    private readonly membershipsService: CampaignMembershipsService,
    private readonly usersDependencies: UsersModuleDependencies,
    private readonly emailPort: EmailPort | undefined,
    private readonly frontendOrigin: string,
  ) {}

  async invite(
    context: RequestContext,
    campaignId: string,
    input: CreateCampaignInvitationDto,
  ) {
    const { actorId, campaignName } = await this.assertOwnerOrSysAdmin(context, campaignId);

    if (!this.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    const target = await this.resolveTarget(input);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000);

    if (target.userId) {
      const existingMembership = await this.membershipsService.getActiveByUser(
        campaignId,
        target.userId,
      );

      if (existingMembership) {
        throw new ConflictError("User is already a campaign member");
      }
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawToken);

    let invitation;

    try {
      invitation = await this.transactionManager.inTransaction(async (tx) => {
        await this.repository.expirePending(tx, now, campaignId);

        const existing = await this.repository.findPendingByCampaignEmail(
          tx,
          campaignId,
          target.email,
        );

        if (existing) {
          throw new ConflictError("A pending invitation already exists for this email");
        }

        return this.repository.create(tx, {
          campaignId,
          email: target.email,
          targetUserId: target.userId,
          role: input.role,
          tokenHash,
          expiresAt,
          actorId,
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError("A pending invitation already exists for this email");
      }

      throw error;
    }

    try {
      const message = renderCampaignInvitationEmail({
        campaignName,
        role: input.role,
        expiresAt,
        acceptUrl: buildCampaignInvitationAcceptUrl({
          frontendOrigin: this.frontendOrigin,
          token: rawToken,
        }),
      });

      await this.emailPort.send({
        to: target.email,
        subject: message.subject,
        text: message.text,
      });
    } catch {
      await this.transactionManager.inTransaction(async (tx) => {
        await this.repository.markRevoked(tx, {
          campaignId,
          invitationId: invitation.id,
          actorId,
          now: new Date(),
        });
      });

      throw new InternalError("Failed to deliver campaign invitation email");
    }

    return {
      id: invitation.id,
      email: invitation.email,
      userTag: target.userTag,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }

  async listPending(context: RequestContext, campaignId: string) {
    await this.assertOwnerOrSysAdmin(context, campaignId);
    const now = new Date();

    await this.transactionManager.inTransaction((tx) =>
      this.repository.expirePending(tx, now, campaignId),
    );

    const invitations = await this.repository.listPendingByCampaign(this.db, campaignId, now);
    const userIds = invitations.flatMap((invitation) =>
      invitation.targetUserId ? [invitation.targetUserId] : [],
    );
    const summaries = await this.usersDependencies.service.listPublicSummaries(userIds);
    const userTagById = new Map(summaries.map((summary) => [summary.id, summary.userTag]));

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      userTag: invitation.targetUserId
        ? (userTagById.get(invitation.targetUserId) ?? null)
        : null,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    }));
  }

  async lookupUserTag(context: RequestContext, campaignId: string, userTag: string) {
    await this.assertOwnerOrSysAdmin(context, campaignId);
    const user = await this.usersDependencies.service.getOneByUserTag(userTag);

    if (!user || user.status !== "ACTIVE") {
      throw new NotFoundError("User not found");
    }

    if (await this.membershipsService.getActiveByUser(campaignId, user.id)) {
      throw new ConflictError("User is already a campaign member");
    }

    return { userTag: user.userTag, displayName: user.displayName };
  }

  async revoke(context: RequestContext, campaignId: string, invitationId: string): Promise<void> {
    const { actorId } = await this.assertOwnerOrSysAdmin(context, campaignId);
    const revoked = await this.repository.markRevoked(this.db, {
      campaignId,
      invitationId,
      actorId,
      now: new Date(),
    });

    if (!revoked) {
      throw new NotFoundError("Pending campaign invitation not found");
    }
  }

  async listForCurrentUser(context: RequestContext) {
    const user = await this.requireAuthenticatedUser(context);
    const now = new Date();

    await this.transactionManager.inTransaction((tx) =>
      this.repository.expirePending(tx, now),
    );

    const invitations = await this.repository.listPendingForUser(this.db, {
      userId: user.id,
      email: user.email.toLowerCase(),
      now,
    });

    return invitations.map((invitation) => ({
      invitationId: invitation.id,
      campaignId: invitation.campaignId,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    }));
  }

  async accept(context: RequestContext, token: string) {
    const user = await this.requireAuthenticatedUser(context);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenError("A verified email is required to accept a campaign invitation");
    }

    const now = new Date();
    const outcome = await this.transactionManager.inTransaction(async (tx) => {
      const invitation = await this.repository.findByTokenHashForUpdate(tx, this.hashToken(token));

      if (!invitation) {
        return { error: "not_found" as const };
      }

      if (invitation.status === "ACCEPTED" && invitation.acceptedBy === user.id) {
        const membership = await this.membershipsService.getActiveByUser(
          invitation.campaignId,
          user.id,
          tx,
        );

        if (membership) {
          return { invitation, membership };
        }
      }

      if (invitation.status === "PENDING" && invitation.expiresAt <= now) {
        await this.repository.expirePending(tx, now, invitation.campaignId);
        return { error: "expired" as const };
      }

      if (invitation.status !== "PENDING") {
        return { error: "not_found" as const };
      }

      if (
        user.email.toLowerCase() !== invitation.email.toLowerCase() ||
        (invitation.targetUserId !== null && invitation.targetUserId !== user.id)
      ) {
        return { error: "not_found" as const };
      }

      const campaign = await this.campaignsService.findMembershipCampaign(
        tx,
        invitation.campaignId,
      );

      if (!campaign) {
        return { error: "not_found" as const };
      }

      let membership = await this.membershipsService.getActiveByUser(
        invitation.campaignId,
        user.id,
        tx,
      );

      if (!membership) {
        membership = await this.membershipsService.createActiveFromInvitation(tx, {
          actorId: user.id,
          campaignId: invitation.campaignId,
          userId: user.id,
          role: invitation.role,
        });
      }

      const accepted = await this.repository.markAccepted(tx, {
        invitationId: invitation.id,
        actorId: user.id,
        now,
      });

      if (!accepted) {
        throw new ConflictError("Campaign invitation changed while being accepted");
      }

      return { invitation, membership };
    });

    if ("error" in outcome) {
      if (outcome.error === "expired") {
        throw new ConflictError("Campaign invitation has expired");
      }

      throw new NotFoundError("Campaign invitation not found");
    }

    return {
      campaignId: outcome.invitation.campaignId,
      membershipId: outcome.membership.id,
      role: outcome.membership.role,
    };
  }

  private async resolveTarget(input: CreateCampaignInvitationDto): Promise<CampaignInvitationTarget> {
    if (input.userTag) {
      const user = await this.usersDependencies.service.getOneByUserTag(input.userTag);

      if (!user || user.status !== "ACTIVE") {
        throw new NotFoundError("User not found");
      }

      return {
        email: user.email.toLowerCase(),
        userId: user.id,
        userTag: user.userTag,
      };
    }

    const email = input.email?.trim().toLowerCase();

    if (!email) {
      throw new ConflictError("Invitation target is required");
    }

    const user = await this.usersDependencies.service.getOneBy({ email });

    if (user && user.status !== "ACTIVE") {
      throw new NotFoundError("User not found");
    }

    return {
      email,
      userId: user?.id ?? null,
      userTag: user?.userTag ?? null,
    };
  }

  private async assertOwnerOrSysAdmin(
    context: RequestContext,
    campaignId: string,
  ): Promise<{ actorId: string; campaignName: string }> {
    const user = await this.requireAuthenticatedUser(context);
    const campaign = await this.campaignsService.findMembershipCampaign(this.db, campaignId);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    if (!isSysAdminRole(context.systemRole) && campaign.ownerUserId !== user.id) {
      throw new NotFoundError("Campaign not found");
    }

    return { actorId: user.id, campaignName: campaign.name };
  }

  private async requireAuthenticatedUser(context: RequestContext) {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    const user = await this.usersDependencies.useCases.getOneUserBy.execute({
      userId: context.actorId,
    });

    if (!user) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    return user;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }
}