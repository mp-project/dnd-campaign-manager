import { createHash, randomBytes } from "node:crypto";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { EmailPort } from "#core/email/index";
import {
  ConflictError,
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
import type { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import type { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import type { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import type { UsersModuleDependencies } from "#src/modules/users/index";

export type CampaignInvitationTarget = {
  email: string;
  userId: string | null;
  userTag: string | null;
};

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
    tx: AppDatabase,
    input: { actorId: string; campaignId: string; userId: string; role: CampaignInvitationRole },
  ) {
    return this.membershipsService.createActiveFromInvitation(tx, input);
  }

  findCampaign(db: AppDatabase, campaignId: string) {
    return this.campaignsService.findMembershipCampaign(db, campaignId);
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
