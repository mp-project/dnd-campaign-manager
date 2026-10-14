import { UnauthenticatedError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { CampaignContext, RequestContext } from "#core/http/requestContext";
import type { PermissionService } from "#core/permissions/service";
import {
  type CampaignAggregate,
  type CampaignRow,
  CampaignsRepository,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import type { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import type { RulesetModuleDependencies } from "#src/modules/ruleset/index";
import type { UsersModuleDependencies } from "#src/modules/users/index";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: CampaignsRepository,
    public readonly permissionService?: PermissionService,
    public readonly rulesetDependencies?: RulesetModuleDependencies,
    public readonly usersDependencies?: UsersModuleDependencies,
    public readonly campaignUserService?: CampaignUserService,
  ) {}

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

  lockCampaign(db: AppDatabase, campaignId: string): Promise<void> {
    return this.repository.lockCampaign(db, campaignId);
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

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }

  assertAuditableActorId(context: RequestContext): string {
    const actorId = this.assertAuthenticated(context);

    if (!uuidPattern.test(actorId)) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    return actorId;
  }

  slugify(input: string): string {
    return slugify(input);
  }

  isUniqueViolation(error: unknown): boolean {
    return findErrorCode(error) === "23505";
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
