import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { CreateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
import {
  RequestAssetLinkItemParamsSchema,
  RequestAssetLinksParamsSchema,
  RequestAssetLinksQuerySchema,
} from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import {
  ResponseAssetLinkFullSchema,
  ResponseAssetLinkListSchema,
  ResponseAssetUsagesSchema,
  ResponseUpdateAssetLinkSchema,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import { UpdateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/UpdateAssetLinkDto";
import { CreateAssetLinkController } from "#src/modules/asset-links/http/controller/CreateAssetLinkController";
import { DeleteAssetLinkController } from "#src/modules/asset-links/http/controller/DeleteAssetLinkController";
import { GetAssetUsagesController } from "#src/modules/asset-links/http/controller/GetAssetUsagesController";
import { ListAssetLinksController } from "#src/modules/asset-links/http/controller/ListAssetLinksController";
import { UpdateAssetLinkController } from "#src/modules/asset-links/http/controller/UpdateAssetLinkController";
import { ASSET_LINKS_PERMISSIONS } from "#src/modules/asset-links/permissions/AssetLinksPermissions";

export type AssetLinksRouteControllers = {
  listAssetLinksController: ListAssetLinksController;
  createAssetLinkController: CreateAssetLinkController;
  updateAssetLinkController: UpdateAssetLinkController;
  deleteAssetLinkController: DeleteAssetLinkController;
  getAssetUsagesController: GetAssetUsagesController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Asset Links"];

const readErrorResponses = {
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

const writeErrorResponses = {
  400: errorResponseDto,
  ...readErrorResponses,
  409: errorResponseDto,
  412: errorResponseDto,
} as const;

export function registerAssetLinksRoutes(
  app: FastifyInstance,
  controllers: AssetLinksRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/assets/:assetId/links",
    {
      config: {
        permission: {
          key: ASSET_LINKS_PERMISSIONS.read,
          hideAsNotFoundForPlayers: true,
        },
      },
      schema: {
        tags,
        operationId: "listAssetLinks",
        security,
        params: RequestAssetLinksParamsSchema,
        querystring: RequestAssetLinksQuerySchema,
        response: {
          200: ResponseAssetLinkListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listAssetLinksController.handle,
  );

  app.post(
    "/campaigns/:campaignId/assets/:assetId/links",
    {
      config: {
        permission: { key: ASSET_LINKS_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createAssetLink",
        security,
        params: RequestAssetLinksParamsSchema,
        body: CreateAssetLinkSchema,
        response: {
          201: ResponseAssetLinkFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createAssetLinkController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/campaigns/:campaignId/assets/:assetId/links/:linkId",
    {
      config: {
        permission: { key: ASSET_LINKS_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateAssetLink",
        security,
        params: RequestAssetLinkItemParamsSchema,
        body: UpdateAssetLinkSchema,
        response: {
          200: ResponseUpdateAssetLinkSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.updateAssetLinkController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/assets/:assetId/links/:linkId",
    {
      config: {
        permission: { key: ASSET_LINKS_PERMISSIONS.delete },
      },
      schema: {
        tags,
        operationId: "deleteAssetLink",
        security,
        params: RequestAssetLinkItemParamsSchema,
        response: {
          204: z.null(),
          ...readErrorResponses,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteAssetLinkController.handle(request);

      return reply.code(204).send();
    },
  );

  app.get(
    "/campaigns/:campaignId/assets/:assetId/usages",
    {
      config: {
        permission: {
          key: ASSET_LINKS_PERMISSIONS.readUsages,
          hideAsNotFoundForPlayers: true,
        },
      },
      schema: {
        tags,
        operationId: "getAssetUsages",
        security,
        params: RequestAssetLinksParamsSchema,
        response: {
          200: ResponseAssetUsagesSchema,
          ...readErrorResponses,
        },
      },
    },
    controllers.getAssetUsagesController.handle,
  );
}
