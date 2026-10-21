import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  RequestAssetParamsSchema,
  RequestCampaignAssetsParamsSchema,
  RequestCampaignAssetsQuerySchema,
  RequestCampaignCatalogParamsSchema,
  RequestCampaignCatalogQuerySchema,
  RequestCatalogParamsSchema,
  RequestCatalogQuerySchema,
} from "#src/modules/assets/domain/dto/RequestAssetDto";
import {
  ResponseAssetGmSchema,
  ResponseAssetListSchema,
  ResponseAssetSchema,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import {
  AssetLifecycleCommandSchema,
  UpdateAssetMetadataSchema,
} from "#src/modules/assets/domain/dto/UpdateAssetDto";
import { DeleteAssetController } from "#src/modules/assets/http/controller/DeleteAssetController";
import { RestoreAssetController } from "#src/modules/assets/http/controller/RestoreAssetController";
import { UpdateAssetController } from "#src/modules/assets/http/controller/UpdateAssetController";
import { GetAssetByIdController } from "#src/modules/assets/http/controller/GetAssetByIdController";
import { ListCampaignAssetsController } from "#src/modules/assets/http/controller/ListCampaignAssetsController";
import { ListCampaignCatalogController } from "#src/modules/assets/http/controller/ListCampaignCatalogController";
import { ListCatalogController } from "#src/modules/assets/http/controller/ListCatalogController";
import { ASSETS_PERMISSIONS } from "#src/modules/assets/permissions/AssetsPermissions";

export type AssetsRouteControllers = {
  listCampaignAssetsController: ListCampaignAssetsController;
  getAssetByIdController: GetAssetByIdController;
  listCampaignCatalogController: ListCampaignCatalogController;
  listCatalogController: ListCatalogController;
  updateAssetController: UpdateAssetController;
  deleteAssetController: DeleteAssetController;
  restoreAssetController: RestoreAssetController;
};

const security = [{ cookieAuth: [] }] as const;

const readRateLimit = { max: 200, timeWindow: "1 minute" } as const;
const writeRateLimit = { max: 60, timeWindow: "1 minute" } as const;

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

export function registerAssetsRoutes(
  app: FastifyInstance,
  controllers: AssetsRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/assets",
    {
      config: {
        rateLimit: readRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.read,
          hideAsNotFoundForPlayers: true,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "listCampaignAssets",
        security,
        params: RequestCampaignAssetsParamsSchema,
        querystring: RequestCampaignAssetsQuerySchema,
        response: {
          200: ResponseAssetListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listCampaignAssetsController.handle,
  );

  app.get(
    "/campaigns/:campaignId/catalog/:assetType",
    {
      config: {
        rateLimit: readRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.readCatalog,
          hideAsNotFoundForPlayers: true,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "listCampaignAssetCatalog",
        security,
        params: RequestCampaignCatalogParamsSchema,
        querystring: RequestCampaignCatalogQuerySchema,
        response: {
          200: ResponseAssetListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listCampaignCatalogController.handle,
  );

  app.get(
    "/assets/:assetId",
    {
      config: {
        rateLimit: readRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.read,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "getAssetById",
        security,
        params: RequestAssetParamsSchema,
        response: {
          200: ResponseAssetSchema,
          ...readErrorResponses,
        },
      },
    },
    controllers.getAssetByIdController.handle,
  );

  app.get(
    "/catalog/:assetType",
    {
      config: {
        rateLimit: readRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.readCatalog,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "listAssetCatalog",
        security,
        params: RequestCatalogParamsSchema,
        querystring: RequestCatalogQuerySchema,
        response: {
          200: ResponseAssetListSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
        },
      },
    },
    controllers.listCatalogController.handle,
  );

  app.patch(
    "/assets/:assetId",
    {
      config: {
        rateLimit: writeRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.updateMetadata,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "updateAsset",
        security,
        params: RequestAssetParamsSchema,
        body: UpdateAssetMetadataSchema,
        response: {
          200: ResponseAssetGmSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.updateAssetController.handle,
  );

  app.delete(
    "/assets/:assetId",
    {
      config: {
        rateLimit: writeRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.archive,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "deleteAsset",
        security,
        params: RequestAssetParamsSchema,
        querystring: AssetLifecycleCommandSchema,
        response: {
          200: ResponseAssetGmSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.deleteAssetController.handle,
  );

  app.post(
    "/assets/:assetId/restore",
    {
      config: {
        rateLimit: writeRateLimit,
        permission: {
          key: ASSETS_PERMISSIONS.restore,
        },
      },
      schema: {
        tags: ["Assets"],
        operationId: "restoreAsset",
        security,
        params: RequestAssetParamsSchema,
        body: AssetLifecycleCommandSchema,
        response: {
          200: ResponseAssetGmSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.restoreAssetController.handle,
  );
}
