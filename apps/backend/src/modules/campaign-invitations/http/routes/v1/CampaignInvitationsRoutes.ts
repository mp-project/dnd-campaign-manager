import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { SENSITIVE_ROUTE_RATE_LIMIT } from "#core/http/rateLimit";
import { CreateCampaignInvitationSchema } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  AcceptCampaignInvitationSchema,
  CampaignInvitationItemParamsSchema,
  CampaignInvitationLookupQuerySchema,
  CampaignInvitationParamsSchema,
} from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import {
  AcceptCampaignInvitationResponseSchema,
  CampaignInvitationListResponseSchema,
  CampaignInvitationResponseSchema,
  CampaignInvitationTargetResponseSchema,
  MyCampaignInvitationListResponseSchema,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { AcceptCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/AcceptCampaignInvitationController";
import { CreateCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/CreateCampaignInvitationController";
import { DeleteCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/DeleteCampaignInvitationController";
import { ListCampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/ListCampaignInvitationsController";
import { ListMyCampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/ListMyCampaignInvitationsController";
import { LookupCampaignInvitationTargetController } from "#src/modules/campaign-invitations/http/controller/LookupCampaignInvitationTargetController";
import { CAMPAIGN_INVITATION_PERMISSIONS } from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";

export type CampaignInvitationsRouteControllers = {
  createCampaignInvitationController: CreateCampaignInvitationController;
  listCampaignInvitationsController: ListCampaignInvitationsController;
  lookupCampaignInvitationTargetController: LookupCampaignInvitationTargetController;
  deleteCampaignInvitationController: DeleteCampaignInvitationController;
  acceptCampaignInvitationController: AcceptCampaignInvitationController;
  listMyCampaignInvitationsController: ListMyCampaignInvitationsController;
};

const tags = ["Campaign Invitations"];
const security = [{ cookieAuth: [] }] as const;

export function registerCampaignInvitationsRoutes(
  app: FastifyInstance,
  controllers: CampaignInvitationsRouteControllers,
): void {
  app.post(
    "/campaigns/:campaignId/invitations",
    {
      config: {
        permission: { key: CAMPAIGN_INVITATION_PERMISSIONS.create },
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "createCampaignInvitation",
        security,
        params: CampaignInvitationParamsSchema,
        body: CreateCampaignInvitationSchema,
        response: {
          201: CampaignInvitationResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await controllers.createCampaignInvitationController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/invitations",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listCampaignInvitations",
        security,
        params: CampaignInvitationParamsSchema,
        response: {
          200: CampaignInvitationListResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.listCampaignInvitationsController.handle,
  );

  app.get(
    "/campaigns/:campaignId/invitations/lookup",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "lookupCampaignInvitationTarget",
        security,
        params: CampaignInvitationParamsSchema,
        querystring: CampaignInvitationLookupQuerySchema,
        response: {
          200: CampaignInvitationTargetResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.lookupCampaignInvitationTargetController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/invitations/:invitationId",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSIONS.revoke } },
      schema: {
        tags,
        operationId: "revokeCampaignInvitation",
        security,
        params: CampaignInvitationItemParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteCampaignInvitationController.handle(request);
      return reply.code(204).send();
    },
  );

  app.post(
    "/invitations/accept",
    {
      config: { rateLimit: SENSITIVE_ROUTE_RATE_LIMIT },
      schema: {
        tags,
        operationId: "acceptCampaignInvitation",
        security,
        body: AcceptCampaignInvitationSchema,
        response: {
          200: AcceptCampaignInvitationResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.acceptCampaignInvitationController.handle,
  );

  app.get(
    "/me/invitations",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listMyCampaignInvitations",
        security,
        response: {
          200: MyCampaignInvitationListResponseSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.listMyCampaignInvitationsController.handle,
  );
}
