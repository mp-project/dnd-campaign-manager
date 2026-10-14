import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
} from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import {
  CampaignMemberListResponseSchema,
  CampaignMembershipResponseSchema,
} from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipDto";
import { CampaignMembershipPermissionsResponseSchema } from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipPermissionsDto";
import {
  CampaignMembershipItemParamsSchema,
  CampaignMembershipParamsSchema,
} from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { UpdateCampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import { CampaignMembershipsController } from "#src/modules/campaign-memberships/http/controller/CampaignMembershipsController";

export function registerCampaignMembershipRoutes(
  app: FastifyInstance,
  controller: CampaignMembershipsController,
): void {
  app.get(
    "/:campaignId/members",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[0] },
      },
      schema: {
        tags: ["Campaign Memberships"],
        operationId: "listCampaignMembers",
        security: [{ cookieAuth: [] }],
        params: CampaignMembershipParamsSchema,
        response: {
          200: CampaignMemberListResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controller.list,
  );

  app.patch(
    "/:campaignId/members/:memberId",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[2] },
      },
      schema: {
        tags: ["Campaign Memberships"],
        operationId: "changeCampaignMemberRole",
        security: [{ cookieAuth: [] }],
        params: CampaignMembershipItemParamsSchema,
        body: UpdateCampaignMembershipRoleSchema,
        response: {
          200: CampaignMembershipResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controller.changeRole,
  );

  app.delete(
    "/:campaignId/members/:memberId",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[3] },
      },
      schema: {
        tags: ["Campaign Memberships"],
        operationId: "revokeCampaignMember",
        security: [{ cookieAuth: [] }],
        params: CampaignMembershipItemParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controller.revoke,
  );

  app.get(
    "/:campaignId/me/permissions",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[0] },
      },
      schema: {
        tags: ["Campaign Memberships"],
        operationId: "getMyCampaignMemberPermissions",
        security: [{ cookieAuth: [] }],
        params: CampaignMembershipParamsSchema,
        response: {
          200: CampaignMembershipPermissionsResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controller.myPermissions,
  );
}
