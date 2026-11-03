import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { CAMPAIGN_MEMBERSHIP_PERMISSIONS } from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
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
import { DeleteCampaignMemberController } from "#src/modules/campaign-memberships/http/controller/DeleteCampaignMemberController";
import { GetMyCampaignPermissionsController } from "#src/modules/campaign-memberships/http/controller/GetMyCampaignPermissionsController";
import { ListCampaignMembersController } from "#src/modules/campaign-memberships/http/controller/ListCampaignMembersController";
import { UpdateCampaignMemberController } from "#src/modules/campaign-memberships/http/controller/UpdateCampaignMemberController";

export type CampaignMembershipsRouteControllers = {
  listCampaignMembersController: ListCampaignMembersController;
  updateCampaignMemberController: UpdateCampaignMemberController;
  deleteCampaignMemberController: DeleteCampaignMemberController;
  getMyCampaignPermissionsController: GetMyCampaignPermissionsController;
};

const tags = ["Campaign Memberships"];
const security = [{ cookieAuth: [] }] as const;

export function registerCampaignMembershipsRoutes(
  app: FastifyInstance,
  controllers: CampaignMembershipsRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/members",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "listCampaignMembers",
        security,
        params: CampaignMembershipParamsSchema,
        response: {
          200: CampaignMemberListResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.listCampaignMembersController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/members/:memberId",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.updateRole },
      },
      schema: {
        tags,
        operationId: "changeCampaignMemberRole",
        security,
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
    controllers.updateCampaignMemberController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/members/:memberId",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.revoke },
      },
      schema: {
        tags,
        operationId: "revokeCampaignMember",
        security,
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
    async (request, reply) => {
      await controllers.deleteCampaignMemberController.handle(request);
      return reply.code(204).send();
    },
  );

  app.get(
    "/campaigns/:campaignId/me/permissions",
    {
      config: {
        permission: { key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "getMyCampaignMemberPermissions",
        security,
        params: CampaignMembershipParamsSchema,
        response: {
          200: CampaignMembershipPermissionsResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getMyCampaignPermissionsController.handle,
  );
}
