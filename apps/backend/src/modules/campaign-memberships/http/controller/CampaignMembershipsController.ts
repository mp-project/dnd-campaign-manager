import type { RequestContext } from "#core/http/requestContext";
import { createStandardListResponse } from "#core/http/listResponse";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  CampaignMembershipItemParamsSchema,
  CampaignMembershipParamsSchema,
} from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { UpdateCampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";

function toMemberResponse(row: {
  membership: {
    id: string;
    userId: string;
    role: "EDITOR" | "PLAYER";
    status: "PENDING" | "ACTIVE" | "REVOKED";
    joinedAt: Date | null;
    version: number;
  };
  userId: string;
  userTag: string;
  displayName: string;
}) {
  return {
    id: row.membership.id,
    userTag: row.userTag,
    displayName: row.displayName,
    role: row.membership.role,
    status: row.membership.status,
    joinedAt: row.membership.joinedAt?.toISOString() ?? null,
    version: row.membership.version,
  };
}

function toMembershipResponse(membership: {
  id: string;
  role: "EDITOR" | "PLAYER";
  status: "PENDING" | "ACTIVE" | "REVOKED";
  joinedAt: Date | null;
  version: number;
}) {
  return {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    version: membership.version,
  };
}

export class CampaignMembershipsController extends AbstractController {
  constructor(private readonly membershipsService: CampaignMembershipsService) {
    super();
  }

  list = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = CampaignMembershipParamsSchema.parse(request.params);
      const result = await this.membershipsService.listMembers(
        request.requestContext,
        campaignId,
      );
      const data = result.members.map((row) =>
        result.canManage
          ? toMemberResponse(row)
          : {
              id: row.membership.id,
              userTag: row.userTag,
              displayName: row.displayName,
              role: row.membership.role,
            },
      );

      return createStandardListResponse({
        data,
        limit: Math.max(data.length, 1),
        nextCursor: null,
        total: data.length,
      });
    });

  changeRole = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, memberId } = CampaignMembershipItemParamsSchema.parse(request.params);
      const input = UpdateCampaignMembershipRoleSchema.parse(request.body);
      const updated = await this.membershipsService.changeRole(
        request.requestContext,
        campaignId,
        memberId,
        input,
      );

      return toMembershipResponse(updated);
    });

  revoke = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: { code(statusCode: number): { send(payload?: unknown): unknown } },
  ) =>
    this.execute(async () => {
      const { campaignId, memberId } = CampaignMembershipItemParamsSchema.parse(request.params);
      await this.membershipsService.revoke(request.requestContext, campaignId, memberId);
      return reply.code(204).send();
    });

  myPermissions = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = CampaignMembershipParamsSchema.parse(request.params);
      const permissions = await this.membershipsService.getMyPermissions(
        request.requestContext,
        campaignId,
      );

      return { permissions };
    });
}
