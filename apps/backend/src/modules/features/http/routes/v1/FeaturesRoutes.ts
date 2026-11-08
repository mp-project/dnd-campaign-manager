import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateFeatureSchema } from "#src/modules/features/domain/dto/CreateFeatureDto";
import {
  RequestCampaignFeatureParamsSchema,
  RequestCampaignFeaturesParamsSchema,
  RequestCampaignFeaturesQuerySchema,
  RequestFeatureCatalogQuerySchema,
  RequestSystemFeatureParamsSchema,
  RequestSystemFeaturesQuerySchema,
  ResolveFeatureSchema,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import {
  ResponseFeatureFullSchema,
  ResponseFeatureListSchema,
  ResponseFeatureSchema,
  ResponseFeatureValidationSchema,
  ResponseResolvedFeatureSchema,
  ResponseUpdateFeatureSchema,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import {
  FeatureLifecycleCommandSchema,
  UpdateFeatureSchema,
} from "#src/modules/features/domain/dto/UpdateFeatureDto";
import type { CreateFeatureController } from "#src/modules/features/http/controller/CreateFeatureController";
import type { DeleteFeatureController } from "#src/modules/features/http/controller/DeleteFeatureController";
import type { GetFeatureController } from "#src/modules/features/http/controller/GetFeatureController";
import type { GetFeatureUsagesController } from "#src/modules/features/http/controller/GetFeatureUsagesController";
import type {
  ListCampaignFeaturesController,
  ListFeatureCatalogController,
  ListSystemFeaturesController,
} from "#src/modules/features/http/controller/ListFeaturesControllers";
import type { ResolveFeatureController } from "#src/modules/features/http/controller/ResolveFeatureController";
import type { RestoreFeatureController } from "#src/modules/features/http/controller/RestoreFeatureController";
import type { UpdateFeatureController } from "#src/modules/features/http/controller/UpdateFeatureController";
import type { ValidateFeatureController } from "#src/modules/features/http/controller/ValidateFeatureController";
import { FEATURES_PERMISSIONS } from "#src/modules/features/permissions/FeaturesPermissions";

export type FeaturesRouteControllers = {
  listCampaignFeaturesController: ListCampaignFeaturesController;
  listFeatureCatalogController: ListFeatureCatalogController;
  listSystemFeaturesController: ListSystemFeaturesController;
  getCampaignFeatureController: GetFeatureController;
  getCatalogFeatureController: GetFeatureController;
  getSystemFeatureController: GetFeatureController;
  createFeatureController: CreateFeatureController;
  updateFeatureController: UpdateFeatureController;
  deleteFeatureController: DeleteFeatureController;
  restoreFeatureController: RestoreFeatureController;
  validateFeatureController: ValidateFeatureController;
  getFeatureUsagesController: GetFeatureUsagesController;
  resolveFeatureController: ResolveFeatureController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Features"];

const readErrorResponses = {
  400: errorResponseDto,
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

const writeErrorResponses = {
  ...readErrorResponses,
  409: errorResponseDto,
  412: errorResponseDto,
} as const;

const campaignRead = { key: FEATURES_PERMISSIONS.read, hideAsNotFoundForPlayers: true };

type Handler = (request: never) => Promise<unknown>;

const created =
  (handle: Handler) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
    reply.code(201).send(await handle(request as never));

/**
 * Custom features under `/campaigns/:campaignId/features`, the catalog of everything a campaign may
 * use under `/campaigns/:campaignId/catalog/features`, global features under `/features`. Global
 * features use the same permissions; the use case only lets administrators change them.
 */
export function registerFeaturesRoutes(
  app: FastifyInstance,
  controllers: FeaturesRouteControllers,
): void {
  // ---------------------------------------------------------------------------
  // Custom features of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/features",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCampaignFeatures",
        security,
        params: RequestCampaignFeaturesParamsSchema,
        querystring: RequestCampaignFeaturesQuerySchema,
        response: { 200: ResponseFeatureListSchema, ...readErrorResponses },
      },
    },
    controllers.listCampaignFeaturesController.handle,
  );

  app.post(
    "/campaigns/:campaignId/features",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createCampaignFeature",
        security,
        params: RequestCampaignFeaturesParamsSchema,
        body: CreateFeatureSchema,
        response: { 201: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createFeatureController.handle),
  );

  app.get(
    "/campaigns/:campaignId/features/:featureId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCampaignFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        response: { 200: ResponseFeatureSchema, ...readErrorResponses },
      },
    },
    controllers.getCampaignFeatureController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/features/:featureId",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateCampaignFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        body: UpdateFeatureSchema,
        response: { 200: ResponseUpdateFeatureSchema, ...writeErrorResponses },
      },
    },
    controllers.updateFeatureController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/features/:featureId",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteCampaignFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        querystring: FeatureLifecycleCommandSchema,
        response: { 200: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteFeatureController.handle,
  );

  app.post(
    "/campaigns/:campaignId/features/:featureId/restore",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreCampaignFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        body: FeatureLifecycleCommandSchema,
        response: { 200: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreFeatureController.handle,
  );

  app.post(
    "/campaigns/:campaignId/features/:featureId/validate",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateCampaignFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        response: { 200: ResponseFeatureValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateFeatureController.handle,
  );

  app.get(
    "/campaigns/:campaignId/features/:featureId/usages",
    {
      config: {
        permission: { key: FEATURES_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "getCampaignFeatureUsages",
        security,
        params: RequestCampaignFeatureParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    controllers.getFeatureUsagesController.handle,
  );

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/catalog/features",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listFeatureCatalog",
        security,
        params: RequestCampaignFeaturesParamsSchema,
        querystring: RequestFeatureCatalogQuerySchema,
        response: { 200: ResponseFeatureListSchema, ...readErrorResponses },
      },
    },
    controllers.listFeatureCatalogController.handle,
  );

  app.get(
    "/campaigns/:campaignId/catalog/features/:featureId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCatalogFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        response: { 200: ResponseFeatureSchema, ...readErrorResponses },
      },
    },
    controllers.getCatalogFeatureController.handle,
  );

  app.post(
    "/campaigns/:campaignId/catalog/features/:featureId/resolve",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "resolveCatalogFeature",
        security,
        params: RequestCampaignFeatureParamsSchema,
        body: ResolveFeatureSchema,
        response: { 200: ResponseResolvedFeatureSchema, ...readErrorResponses },
      },
    },
    controllers.resolveFeatureController.handle,
  );

  // ---------------------------------------------------------------------------
  // Global features
  // ---------------------------------------------------------------------------

  app.get(
    "/features",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listSystemFeatures",
        security,
        querystring: RequestSystemFeaturesQuerySchema,
        response: { 200: ResponseFeatureListSchema, ...readErrorResponses },
      },
    },
    controllers.listSystemFeaturesController.handle,
  );

  app.post(
    "/features",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createSystemFeature",
        security,
        body: CreateFeatureSchema,
        response: { 201: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createFeatureController.handle),
  );

  app.get(
    "/features/:featureId",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "getSystemFeature",
        security,
        params: RequestSystemFeatureParamsSchema,
        response: { 200: ResponseFeatureSchema, ...readErrorResponses },
      },
    },
    controllers.getSystemFeatureController.handle,
  );

  app.patch(
    "/features/:featureId",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateSystemFeature",
        security,
        params: RequestSystemFeatureParamsSchema,
        body: UpdateFeatureSchema,
        response: { 200: ResponseUpdateFeatureSchema, ...writeErrorResponses },
      },
    },
    controllers.updateFeatureController.handle,
  );

  app.delete(
    "/features/:featureId",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteSystemFeature",
        security,
        params: RequestSystemFeatureParamsSchema,
        querystring: FeatureLifecycleCommandSchema,
        response: { 200: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteFeatureController.handle,
  );

  app.post(
    "/features/:featureId/restore",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreSystemFeature",
        security,
        params: RequestSystemFeatureParamsSchema,
        body: FeatureLifecycleCommandSchema,
        response: { 200: ResponseFeatureFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreFeatureController.handle,
  );

  app.post(
    "/features/:featureId/validate",
    {
      config: { permission: { key: FEATURES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateSystemFeature",
        security,
        params: RequestSystemFeatureParamsSchema,
        response: { 200: ResponseFeatureValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateFeatureController.handle,
  );
}
