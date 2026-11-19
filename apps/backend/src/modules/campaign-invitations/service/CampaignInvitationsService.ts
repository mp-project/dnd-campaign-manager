import { createHash, randomBytes } from "node:crypto";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { authorized } from "#core/history/authorization";
import type { ActionScope, HistoryPort } from "#core/history/types";
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
import type { CampaignInvitationRole } from "#src/modules/campaign-invitations/domain/dto/BaseCampaignInvitationDto";
import type { CreateCampaignInvitationDto } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  buildCampaignInvitationAcceptUrl,
  renderCampaignInvitationEmail,
} from "#src/modules/campaign-invitations/email/CampaignInvitationEmailTemplate";
import type { AcceptCampaignInvitationResponseDto } from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import type {
  CampaignInvitationRow,
  CampaignInvitationsRepository,
} from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import type { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import { CAMPAIGN_MEMBERSHIP_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaignMembership";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

export type CampaignInvitationTarget = {
  email: string;
  userId: string | null;
  userTag: string | null;
};

/** Loads the invitation to accept, locked for the action (by token or by id). */
export type LockInvitation = (tx: AppDatabase) => Promise<CampaignInvitationRow | null>;

/**
 * Why accepting conflicts (`details.reason` of the 409), so clients can say what happened:
 * expired, answered or taken back meanwhile, or the account is a member already.
 */
export type AcceptConflictReason = "expired" | "changed" | "member";

/**
 * Shared invitation logic for the use cases: access checks, target resolution, tokens and
 * access to the campaign, membership and user modules.
 */
export class CampaignInvitationsService {
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: CampaignInvitationsRepository,
    private readonly campaignsService: CampaignsService,
    private readonly membershipsService: CampaignMembershipsService,
    private readonly usersDependencies: UsersModuleDependencies,
    private readonly emailPort: EmailPort | undefined,
    private readonly frontendOrigin: string,
  ) {}

  async assertOwnerOrSysAdmin(
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

  async requireAuthenticatedUser(context: RequestContext) {
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

  async findActiveUserByTag(userTag: string) {
    const user = await this.usersDependencies.service.getOneByUserTag(userTag);

    if (!user || user.status !== "ACTIVE") {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  async resolveTarget(input: CreateCampaignInvitationDto): Promise<CampaignInvitationTarget> {
    if (input.userTag) {
      const user = await this.findActiveUserByTag(input.userTag);

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

    // By email no account is looked up: whether the address has one (active, locked, already a
    // member) must not show in the answer. Whoever has the address accepts; a member gets their
    // membership back.
    return {
      email,
      userId: null,
      userTag: null,
    };
  }

  async listUserTagsById(userIds: string[]): Promise<Map<string, string>> {
    const summaries = await this.usersDependencies.service.listPublicSummaries(userIds);
    return new Map(summaries.map((summary) => [summary.id, summary.userTag]));
  }

  async assertNotMember(campaignId: string, userId: string): Promise<void> {
    if (await this.membershipsService.getActiveByUser(campaignId, userId)) {
      throw new ConflictError("User is already a campaign member");
    }
  }

  findActiveMembership(campaignId: string, userId: string, db: AppDatabase) {
    return this.membershipsService.getActiveByUser(campaignId, userId, db);
  }

  createMembershipFromInvitation(
    scope: ActionScope,
    input: { campaignId: string; userId: string; role: CampaignInvitationRole },
  ) {
    return this.membershipsService.createActiveFromInvitation(scope, input);
  }

  findCampaign(db: AppDatabase, campaignId: string) {
    return this.campaignsService.findMembershipCampaign(db, campaignId);
  }

  /**
   * Accepts the invitation `lockInvitation` loads (locked, by token or by id) for the authenticated
   * user, if it is theirs (`isAddressedTo`); accepting needs a verified email (403, `details.reason`
   * `unverified`). Creates the membership and uses up the account's other pending invitations to
   * the campaign; accepting again returns it. A member accepting ends the invitation (409 `member`). A foreign or unknown invitation is 404 before anything
   * else; an own one that can't be answered any more is 409 with `details.reason` (`closedReason`).
   */
  async acceptInvitation(
    history: HistoryPort,
    context: RequestContext,
    lockInvitation: LockInvitation,
  ): Promise<AcceptCampaignInvitationResponseDto> {
    const user = await this.requireAuthenticatedUser(context);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenError("A verified email is required to accept a campaign invitation", {
        reason: "unverified",
      });
    }

    const now = new Date();
    const outcome = await history.runAction(
      {
        action: CAMPAIGN_MEMBERSHIP_ACTIONS.join,
        context,
        // The actor is checked above, the invitation (token or id) and the email against the locked row below.
        authorize: async () => authorized(),
      },
      async (scope) => {
        const { tx } = scope;
        const invitation = await lockInvitation(tx);

        // Not this account's invitation: 404 before anything else, so expiry or status of
        // foreign invitations stays unknown and nothing is written for them.
        if (!invitation || !this.isAddressedTo(invitation, user)) {
          return { error: "not_found" as const };
        }

        if (invitation.status === "ACCEPTED" && invitation.acceptedBy === user.id) {
          const membership = await this.findActiveMembership(invitation.campaignId, user.id, tx);

          if (membership) {
            return { invitation, membership };
          }
        }

        const closed = this.closedReason(invitation, now);
        if (closed) {
          if (invitation.status === "PENDING") await this.repository.updateExpired(tx, now, invitation.campaignId);
          return { error: closed };
        }

        if (!(await this.findCampaign(tx, invitation.campaignId))) {
          return { error: "not_found" as const };
        }

        // A member can't be invited again: the invitation (one by email the game master couldn't
        // know about) ends without effect, and its token is used up.
        if (await this.findActiveMembership(invitation.campaignId, user.id, tx)) {
          await this.repository.updateStatus(tx, {
            status: "REVOKED",
            campaignId: invitation.campaignId,
            invitationId: invitation.id,
            actorId: user.id,
            now,
          });
          return { error: "member" as const };
        }

        const membership = await this.createMembershipFromInvitation(scope, {
          campaignId: invitation.campaignId,
          userId: user.id,
          role: invitation.role,
        });

        const accepted = await this.repository.updateStatus(tx, {
          status: "ACCEPTED",
          invitationId: invitation.id,
          actorId: user.id,
          now,
        });

        if (!accepted) {
          // Can't happen under the row lock; kept so a changed row never counts as accepted.
          throw this.closedError("changed");
        }

        // Other pending invitations of this account to the campaign (by tag and by email) are
        // used up as well: a member can't be invited again.
        await this.repository.revokeOtherPendingForAccount(tx, {
          campaignId: invitation.campaignId,
          exceptInvitationId: invitation.id,
          userId: user.id,
          email: user.email.toLowerCase(),
          now,
        });

        return { invitation, membership };
      },
    );

    if ("error" in outcome) {
      if (outcome.error === "expired" || outcome.error === "changed" || outcome.error === "member") {
        throw this.closedError(outcome.error);
      }

      throw new NotFoundError("Campaign invitation not found");
    }

    return {
      campaignId: outcome.invitation.campaignId,
      membershipId: outcome.membership.id,
      role: outcome.membership.role,
    };
  }

  /**
   * Why an own invitation can't be answered any more, or null while it is pending and valid:
   * `expired` (also once marked so), `changed` (taken back, declined or accepted meanwhile).
   */
  closedReason(invitation: CampaignInvitationRow, now: Date): AcceptConflictReason | null {
    if (invitation.status === "EXPIRED" || (invitation.status === "PENDING" && invitation.expiresAt <= now)) return "expired";
    return invitation.status === "PENDING" ? null : "changed";
  }

  /** The 409 for an own invitation that can't be answered any more, with its reason. */
  closedError(reason: AcceptConflictReason): ConflictError {
    const message = {
      expired: "Campaign invitation has expired",
      changed: "Campaign invitation was answered or taken back",
      member: "Already a member of the campaign",
    }[reason];
    return new ConflictError(message, { reason });
  }

  /**
   * Leaves out invitations to campaigns the account belongs to already: they can't be accepted,
   * and one by email the game master sent without knowing must not show.
   */
  async withoutMemberships(invitations: CampaignInvitationRow[], userId: string): Promise<CampaignInvitationRow[]> {
    const campaignIds = [...new Set(invitations.map((invitation) => invitation.campaignId))];
    const memberships = await Promise.all(campaignIds.map((id) => this.membershipsService.getActiveByUser(id, userId)));
    const member = new Set(campaignIds.filter((_id, index) => memberships[index]));
    return invitations.filter((invitation) => !member.has(invitation.campaignId));
  }

  /**
   * Whether an invitation is meant for this account; the one rule for its own list (the SQL of
   * `listPendingForUser`), accepting and declining. An invitation by user tag (`targetUserId`)
   * belongs to that account, also after it changed its address; one by email address belongs to
   * whoever has that address, once it is verified.
   */
  isAddressedTo(
    invitation: CampaignInvitationRow,
    user: { id: string; email: string; emailVerifiedAt: Date | null },
  ): boolean {
    if (invitation.targetUserId !== null) return invitation.targetUserId === user.id;
    return Boolean(user.emailVerifiedAt) && invitation.email.toLowerCase() === user.email.toLowerCase();
  }

  /** Name of each campaign and of each inviting account for the account's own list. */
  async describeForInvitee(invitations: CampaignInvitationRow[]) {
    const campaignIds = [...new Set(invitations.map((invitation) => invitation.campaignId))];
    const campaigns = await Promise.all(campaignIds.map((id) => this.campaignsService.findMembershipCampaign(this.db, id)));
    const campaignName = new Map(campaigns.flatMap((campaign) => (campaign ? [[campaign.id, campaign.name] as const] : [])));
    const inviters = await this.usersDependencies.service.listPublicSummaries([
      ...new Set(invitations.map((invitation) => invitation.invitedBy)),
    ]);
    const inviterName = new Map(inviters.map((summary) => [summary.id, summary.displayName]));

    // A campaign that is gone can't be joined: its invitations drop out of the list.
    return invitations.flatMap((invitation) => {
      const name = campaignName.get(invitation.campaignId);
      return name ? [{ invitation, campaignName: name, invitedByName: inviterName.get(invitation.invitedBy) ?? null }] : [];
    });
  }

  assertEmailAvailable(): void {
    this.requireEmailPort();
  }

  async sendInvitationEmail(input: {
    to: string;
    campaignName: string;
    role: CampaignInvitationRole;
    expiresAt: Date;
    token: string;
  }): Promise<void> {
    const emailPort = this.requireEmailPort();
    const message = renderCampaignInvitationEmail({
      campaignName: input.campaignName,
      role: input.role,
      expiresAt: input.expiresAt,
      acceptUrl: buildCampaignInvitationAcceptUrl({
        frontendOrigin: this.frontendOrigin,
        token: input.token,
      }),
    });

    await emailPort.send({
      to: input.to,
      subject: message.subject,
      text: message.text,
    });
  }

  createToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }

  private requireEmailPort(): EmailPort {
    if (!this.emailPort) {
      throw new InternalError("Email service unavailable");
    }

    return this.emailPort;
  }
}
