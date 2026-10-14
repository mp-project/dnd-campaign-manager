import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { CAMPAIGN_INVITATION_PERMISSION_KEYS } from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";
import { CreateCampaignInvitationSchema } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  AcceptCampaignInvitationSchema,
  CampaignInvitationLookupQuerySchema,
  CampaignInvitationItemParamsSchema,
  CampaignInvitationParamsSchema,
} from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import {
  AcceptCampaignInvitationResponseSchema,
  CampaignInvitationListResponseSchema,
  CampaignInvitationResponseSchema,
  CampaignInvitationTargetResponseSchema,
  MyCampaignInvitationListResponseSchema,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/CampaignInvitationsController";

export function registerCampaignInvitationRoutes(
  app: FastifyInstance,
  controller: CampaignInvitationsController,
): void {
  app.post(
    "/:campaignId/invitations",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSION_KEYS[0] } },
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "createCampaignInvitation",
        security: [{ cookieAuth: [] }],
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
    async (request, reply) => reply.code(201).send(await controller.create(request)),
  );

  app.get(
    "/:campaignId/invitations",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSION_KEYS[1] } },
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "listCampaignInvitations",
        security: [{ cookieAuth: [] }],
        params: CampaignInvitationParamsSchema,
        response: {
          200: CampaignInvitationListResponseSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controller.list,
  );

  app.get(
    "/:campaignId/invitations/lookup",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSION_KEYS[1] } },
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "lookupCampaignInvitationTarget",
        security: [{ cookieAuth: [] }],
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
    controller.lookupUserTag,
  );

  app.delete(
    "/:campaignId/invitations/:invitationId",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSION_KEYS[2] } },
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "revokeCampaignInvitation",
        security: [{ cookieAuth: [] }],
        params: CampaignInvitationItemParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controller.revoke,
  );
}

export function registerUserInvitationRoutes(
  app: FastifyInstance,
  controller: CampaignInvitationsController,
): void {
  app.post(
    "/invitations/accept",
    {
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "acceptCampaignInvitation",
        security: [{ cookieAuth: [] }],
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
    controller.accept,
  );

  app.get(
    "/me/invitations",
    {
      config: { permission: { key: CAMPAIGN_INVITATION_PERMISSION_KEYS[1] } },
      schema: {
        tags: ["Campaign Invitations"],
        operationId: "listMyCampaignInvitations",
        security: [{ cookieAuth: [] }],
        response: {
          200: MyCampaignInvitationListResponseSchema,
          401: errorResponseDto,
        },
      },
    },
    controller.listForCurrentUser,
  );
}