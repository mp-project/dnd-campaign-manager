import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { CreateCampaignSchema } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import { UpdateCampaignSchema } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { AdvanceCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import { CorrectCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import {
  RequestCampaignListQuerySchema,
  RequestCampaignParamsSchema,
} from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import {
  ResponseCampaignListSchema,
  ResponseCampaignSchema,
  ResponseUpdateCampaignSchema,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CAMPAIGNS_PERMISSIONS } from "#src/modules/campaigns/permissions/CampaignsPermissions";
import { ListCampaignsController } from "#src/modules/campaigns/http/controller/ListCampaignsController";
import { GetCampaignByIdController } from "#src/modules/campaigns/http/controller/GetCampaignByIdController";
import { CreateCampaignController } from "#src/modules/campaigns/http/controller/CreateCampaignController";
import { UpdateCampaignController } from "#src/modules/campaigns/http/controller/UpdateCampaignController";
import { DeleteCampaignController } from "#src/modules/campaigns/http/controller/DeleteCampaignController";
import { AdvanceCampaignTimeController } from "#src/modules/campaigns/http/controller/AdvanceCampaignTimeController";
import { CorrectCampaignTimeController } from "#src/modules/campaigns/http/controller/CorrectCampaignTimeController";

export type CampaignsRouteControllers = {
  listCampaignsController: ListCampaignsController;
  getCampaignByIdController: GetCampaignByIdController;
  createCampaignController: CreateCampaignController;
  updateCampaignController: UpdateCampaignController;
  deleteCampaignController: DeleteCampaignController;
  advanceCampaignTimeController: AdvanceCampaignTimeController;
  correctCampaignTimeController: CorrectCampaignTimeController;
};

const tags = ["Campaigns"];
const security = [{ cookieAuth: [] }] as const;

export function registerCampaignsRoutes(
  app: FastifyInstance,
  controllers: CampaignsRouteControllers,
): void {
  app.get(
    "/campaigns",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "listCampaigns",
        security,
        querystring: RequestCampaignListQuerySchema,
        response: {
          200: ResponseCampaignListSchema,
          401: errorResponseDto,
          403: errorResponseDto,
        },
      },
    },
    controllers.listCampaignsController.handle,
  );

  app.get(
    "/campaigns/:campaignId",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "getCampaignById",
        security,
        params: RequestCampaignParamsSchema,
        response: {
          200: ResponseCampaignSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getCampaignByIdController.handle,
  );

  app.post(
    "/campaigns",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createCampaign",
        security,
        body: CreateCampaignSchema,
        response: {
          201: ResponseCampaignSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createCampaignController.handle(request);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/campaigns/:campaignId",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateCampaign",
        security,
        params: RequestCampaignParamsSchema,
        body: UpdateCampaignSchema,
        response: {
          200: ResponseUpdateCampaignSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.updateCampaignController.handle,
  );

  app.delete(
    "/campaigns/:campaignId",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.archive },
      },
      schema: {
        tags,
        operationId: "archiveCampaign",
        security,
        params: RequestCampaignParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteCampaignController.handle(request);
      return reply.code(204).send();
    },
  );

  app.post(
    "/campaigns/:campaignId/time/advance",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.advanceTime },
      },
      schema: {
        tags,
        operationId: "advanceCampaignTime",
        security,
        params: RequestCampaignParamsSchema,
        body: AdvanceCampaignTimeSchema,
        response: {
          200: ResponseCampaignSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.advanceCampaignTimeController.handle,
  );

  app.post(
    "/campaigns/:campaignId/time/correct",
    {
      config: {
        permission: { key: CAMPAIGNS_PERMISSIONS.correctTime },
      },
      schema: {
        tags,
        operationId: "correctCampaignTime",
        security,
        params: RequestCampaignParamsSchema,
        body: CorrectCampaignTimeSchema,
        response: {
          200: ResponseCampaignSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.correctCampaignTimeController.handle,
  );
}
