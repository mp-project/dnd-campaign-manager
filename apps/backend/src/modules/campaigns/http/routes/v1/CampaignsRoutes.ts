import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { CreateCampaignRequestSchema } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import { UpdateCampaignSchema } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { AdvanceCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import { CorrectCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import {
  RequestCampaignListQuerySchema,
  RequestCampaignParamsSchema,
  RequestCampaignTimeHistoryQuerySchema,
} from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import {
  ResponseCampaignListSchema,
  ResponseCampaignSchema,
  ResponseCampaignTimeHistorySchema,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import {
  CAMPAIGNS_HTTP_PATHS,
  CAMPAIGNS_HTTP_PERMISSIONS,
  CAMPAIGNS_HTTP_RATE_LIMITS,
  CAMPAIGNS_HTTP_SECURITY,
} from "#src/modules/campaigns/config/CampaignsHttpConfig";
import { ListCampaignsController } from "#src/modules/campaigns/http/controller/ListCampaignsController";
import { GetCampaignByIdController } from "#src/modules/campaigns/http/controller/GetCampaignByIdController";
import { CreateCampaignController } from "#src/modules/campaigns/http/controller/CreateCampaignController";
import { UpdateCampaignController } from "#src/modules/campaigns/http/controller/UpdateCampaignController";
import { DeleteCampaignController } from "#src/modules/campaigns/http/controller/DeleteCampaignController";
import { AdvanceCampaignTimeController } from "#src/modules/campaigns/http/controller/AdvanceCampaignTimeController";
import { CorrectCampaignTimeController } from "#src/modules/campaigns/http/controller/CorrectCampaignTimeController";
import { GetCampaignTimeHistoryController } from "#src/modules/campaigns/http/controller/GetCampaignTimeHistoryController";

export type CampaignsRouteControllers = {
  listCampaignsController: ListCampaignsController;
  getCampaignByIdController: GetCampaignByIdController;
  createCampaignController: CreateCampaignController;
  updateCampaignController: UpdateCampaignController;
  deleteCampaignController: DeleteCampaignController;
  advanceCampaignTimeController: AdvanceCampaignTimeController;
  correctCampaignTimeController: CorrectCampaignTimeController;
  getCampaignTimeHistoryController: GetCampaignTimeHistoryController;
};

export function registerCampaignsRoutes(
  app: FastifyInstance,
  controllers: CampaignsRouteControllers,
): void {
  app.get(
    CAMPAIGNS_HTTP_PATHS.collection,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.read,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.read,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "listCampaigns",
        security: CAMPAIGNS_HTTP_SECURITY,
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
    CAMPAIGNS_HTTP_PATHS.item,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.read,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.read,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "getCampaignById",
        security: CAMPAIGNS_HTTP_SECURITY,
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
    CAMPAIGNS_HTTP_PATHS.collection,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.write,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.create,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "createCampaign",
        security: CAMPAIGNS_HTTP_SECURITY,
        body: CreateCampaignRequestSchema,
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
    controllers.createCampaignController.handle,
  );

  app.patch(
    CAMPAIGNS_HTTP_PATHS.item,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.write,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.update,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "updateCampaign",
        security: CAMPAIGNS_HTTP_SECURITY,
        params: RequestCampaignParamsSchema,
        body: UpdateCampaignSchema,
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
    controllers.updateCampaignController.handle,
  );

  app.delete(
    CAMPAIGNS_HTTP_PATHS.item,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.write,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.archive,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "archiveCampaign",
        security: CAMPAIGNS_HTTP_SECURITY,
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
    controllers.deleteCampaignController.handle,
  );

  app.post(
    CAMPAIGNS_HTTP_PATHS.advanceTime,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.write,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.advanceTime,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "advanceCampaignTime",
        security: CAMPAIGNS_HTTP_SECURITY,
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
    CAMPAIGNS_HTTP_PATHS.correctTime,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.write,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.correctTime,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "correctCampaignTime",
        security: CAMPAIGNS_HTTP_SECURITY,
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

  app.get(
    CAMPAIGNS_HTTP_PATHS.timeHistory,
    {
      config: {
        rateLimit: CAMPAIGNS_HTTP_RATE_LIMITS.read,
        permission: {
          key: CAMPAIGNS_HTTP_PERMISSIONS.read,
        },
      },
      schema: {
        tags: ["Campaigns"],
        operationId: "getCampaignTimeHistory",
        security: CAMPAIGNS_HTTP_SECURITY,
        params: RequestCampaignParamsSchema,
        querystring: RequestCampaignTimeHistoryQuerySchema,
        response: {
          200: ResponseCampaignTimeHistorySchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getCampaignTimeHistoryController.handle,
  );
}
