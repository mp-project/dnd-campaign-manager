import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateFeatSchema } from "#src/modules/feats/domain/dto/CreateFeatDto";
import {
  EligibilityCheckSchema,
  RequestCampaignFeatParamsSchema,
  RequestCampaignFeatsParamsSchema,
  RequestCampaignFeatsQuerySchema,
  RequestFeatCatalogQuerySchema,
  RequestSystemFeatParamsSchema,
  RequestSystemFeatsQuerySchema,
  ResolveFeatSchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import {
  ResponseFeatCategoriesSchema,
  ResponseFeatChoicesSchema,
  ResponseFeatEligibilitySchema,
  ResponseFeatFeaturesSchema,
  ResponseFeatFullSchema,
  ResponseFeatListSchema,
  ResponseFeatPrerequisitesSchema,
  ResponseFeatResolutionSchema,
  ResponseFeatSchema,
  ResponseFeatValidationSchema,
  ResponseUpdateFeatSchema,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import {
  FeatLifecycleCommandSchema,
  UpdateFeatSchema,
} from "#src/modules/feats/domain/dto/UpdateFeatDto";
import type {
  CheckFeatEligibilityController,
  CreateFeatController,
  DeleteFeatController,
  GetFeatCategoriesController,
  GetFeatController,
  GetFeatSectionController,
  ListCampaignFeatsController,
  ListFeatCatalogController,
  ListSystemFeatsController,
  ResolveFeatController,
  RestoreFeatController,
  UpdateFeatController,
  ValidateFeatController,
} from "#src/modules/feats/http/controller/FeatControllers";
import { FEATS_PERMISSIONS } from "#src/modules/feats/permissions/FeatsPermissions";

export type FeatsRouteControllers = {
  listCampaignFeatsController: ListCampaignFeatsController;
  listFeatCatalogController: ListFeatCatalogController;
  listSystemFeatsController: ListSystemFeatsController;
  getCampaignFeatController: GetFeatController;
  getCatalogFeatController: GetFeatController;
  getSystemFeatController: GetFeatController;
  getFeatCategoriesController: GetFeatCategoriesController;
  getFeatPrerequisitesController: GetFeatSectionController;
  getFeatChoicesController: GetFeatSectionController;
  getFeatFeaturesController: GetFeatSectionController;
  getCampaignFeatUsagesController: GetFeatSectionController;
  getCatalogFeatUsagesController: GetFeatSectionController;
  checkFeatEligibilityController: CheckFeatEligibilityController;
  resolveFeatController: ResolveFeatController;
  createFeatController: CreateFeatController;
  updateFeatController: UpdateFeatController;
  deleteFeatController: DeleteFeatController;
  restoreFeatController: RestoreFeatController;
  validateFeatController: ValidateFeatController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Feats"];

const readErrorResponses = {
  400: errorResponseDto,
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

/** Reads answer 409 when the stored definition no longer parses. */
const definitionReadErrorResponses = { ...readErrorResponses, 409: errorResponseDto } as const;

const writeErrorResponses = {
  ...readErrorResponses,
  409: errorResponseDto,
  412: errorResponseDto,
} as const;

const campaignRead = { key: FEATS_PERMISSIONS.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: FEATS_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true };
const campaignEligibility = {
  key: FEATS_PERMISSIONS.checkEligibility,
  hideAsNotFoundForPlayers: true,
};

type Handler = (request: never) => Promise<unknown>;

const created =
  (handle: Handler) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
    reply.code(201).send(await handle(request as never));

/**
 * Custom feats under `/campaigns/:campaignId/feats`, the catalog of everything a campaign may
 * choose under `/campaigns/:campaignId/catalog/feats` (with sections, the eligibility check and
 * the resolution of choices), global feats under `/feats`. Global feats use the same permissions;
 * the use case only lets administrators change them. The parts of a definition are replaced with
 * `PATCH`, there are no separate routes per part.
 */
export function registerFeatsRoutes(app: FastifyInstance, controllers: FeatsRouteControllers): void {
  // ---------------------------------------------------------------------------
  // Custom feats of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/feats",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCampaignFeats",
        security,
        params: RequestCampaignFeatsParamsSchema,
        querystring: RequestCampaignFeatsQuerySchema,
        response: { 200: ResponseFeatListSchema, ...readErrorResponses },
      },
    },
    controllers.listCampaignFeatsController.handle,
  );

  app.post(
    "/campaigns/:campaignId/feats",
    {
      config: { permission: { key: FEATS_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createCampaignFeat",
        security,
        params: RequestCampaignFeatsParamsSchema,
        body: CreateFeatSchema,
        response: { 201: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createFeatController.handle),
  );

  app.get(
    "/campaigns/:campaignId/feats/:featId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCampaignFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        response: { 200: ResponseFeatSchema, ...definitionReadErrorResponses },
      },
    },
    controllers.getCampaignFeatController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/feats/:featId",
    {
      config: { permission: { key: FEATS_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateCampaignFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        body: UpdateFeatSchema,
        response: { 200: ResponseUpdateFeatSchema, ...writeErrorResponses },
      },
    },
    controllers.updateFeatController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/feats/:featId",
    {
      config: { permission: { key: FEATS_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteCampaignFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        querystring: FeatLifecycleCommandSchema,
        response: { 200: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteFeatController.handle,
  );

  app.post(
    "/campaigns/:campaignId/feats/:featId/restore",
    {
      config: { permission: { key: FEATS_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreCampaignFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        body: FeatLifecycleCommandSchema,
        response: { 200: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreFeatController.handle,
  );

  app.post(
    "/campaigns/:campaignId/feats/:featId/validate",
    {
      config: { permission: { key: FEATS_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateCampaignFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        response: { 200: ResponseFeatValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateFeatController.handle,
  );

  app.get(
    "/campaigns/:campaignId/feats/:featId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCampaignFeatUsages",
        security,
        params: RequestCampaignFeatParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    controllers.getCampaignFeatUsagesController.handle,
  );

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/catalog/feats",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listFeatCatalog",
        security,
        params: RequestCampaignFeatsParamsSchema,
        querystring: RequestFeatCatalogQuerySchema,
        response: { 200: ResponseFeatListSchema, ...readErrorResponses },
      },
    },
    controllers.listFeatCatalogController.handle,
  );

  app.get(
    "/campaigns/:campaignId/catalog/feats/categories",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getFeatCategories",
        security,
        params: RequestCampaignFeatsParamsSchema,
        response: { 200: ResponseFeatCategoriesSchema, ...readErrorResponses },
      },
    },
    controllers.getFeatCategoriesController.handle,
  );

  app.get(
    "/campaigns/:campaignId/catalog/feats/:featId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCatalogFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        response: { 200: ResponseFeatSchema, ...definitionReadErrorResponses },
      },
    },
    controllers.getCatalogFeatController.handle,
  );

  const sections = [
    ["prerequisites", "Prerequisites", ResponseFeatPrerequisitesSchema, controllers.getFeatPrerequisitesController],
    ["choices", "Choices", ResponseFeatChoicesSchema, controllers.getFeatChoicesController],
    ["features", "Features", ResponseFeatFeaturesSchema, controllers.getFeatFeaturesController],
  ] as const;

  for (const [path, name, response, controller] of sections) {
    app.get(
      `/campaigns/:campaignId/catalog/feats/:featId/${path}`,
      {
        config: { permission: campaignRead },
        schema: {
          tags,
          operationId: `getCatalogFeat${name}`,
          security,
          params: RequestCampaignFeatParamsSchema,
          response: { 200: response, ...definitionReadErrorResponses },
        },
      },
      controller.handle,
    );
  }

  app.get(
    "/campaigns/:campaignId/catalog/feats/:featId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCatalogFeatUsages",
        security,
        params: RequestCampaignFeatParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    controllers.getCatalogFeatUsagesController.handle,
  );

  app.post(
    "/campaigns/:campaignId/catalog/feats/:featId/eligibility-check",
    {
      config: { permission: campaignEligibility },
      schema: {
        tags,
        operationId: "checkFeatEligibility",
        security,
        params: RequestCampaignFeatParamsSchema,
        body: EligibilityCheckSchema,
        response: { 200: ResponseFeatEligibilitySchema, ...definitionReadErrorResponses },
      },
    },
    controllers.checkFeatEligibilityController.handle,
  );

  app.post(
    "/campaigns/:campaignId/catalog/feats/:featId/resolve",
    {
      config: { permission: campaignEligibility },
      schema: {
        tags,
        operationId: "resolveFeat",
        security,
        params: RequestCampaignFeatParamsSchema,
        body: ResolveFeatSchema,
        response: { 200: ResponseFeatResolutionSchema, ...definitionReadErrorResponses },
      },
    },
    controllers.resolveFeatController.handle,
  );

  // ---------------------------------------------------------------------------
  // Global feats
  // ---------------------------------------------------------------------------

  app.get(
    "/feats",
    {
      config: { permission: { key: FEATS_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listSystemFeats",
        security,
        querystring: RequestSystemFeatsQuerySchema,
        response: { 200: ResponseFeatListSchema, ...readErrorResponses },
      },
    },
    controllers.listSystemFeatsController.handle,
  );

  app.post(
    "/feats",
    {
      config: { permission: { key: FEATS_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createSystemFeat",
        security,
        body: CreateFeatSchema,
        response: { 201: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createFeatController.handle),
  );

  app.get(
    "/feats/:featId",
    {
      config: { permission: { key: FEATS_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "getSystemFeat",
        security,
        params: RequestSystemFeatParamsSchema,
        response: { 200: ResponseFeatSchema, ...definitionReadErrorResponses },
      },
    },
    controllers.getSystemFeatController.handle,
  );

  app.patch(
    "/feats/:featId",
    {
      config: { permission: { key: FEATS_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateSystemFeat",
        security,
        params: RequestSystemFeatParamsSchema,
        body: UpdateFeatSchema,
        response: { 200: ResponseUpdateFeatSchema, ...writeErrorResponses },
      },
    },
    controllers.updateFeatController.handle,
  );

  app.delete(
    "/feats/:featId",
    {
      config: { permission: { key: FEATS_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteSystemFeat",
        security,
        params: RequestSystemFeatParamsSchema,
        querystring: FeatLifecycleCommandSchema,
        response: { 200: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteFeatController.handle,
  );

  app.post(
    "/feats/:featId/restore",
    {
      config: { permission: { key: FEATS_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreSystemFeat",
        security,
        params: RequestSystemFeatParamsSchema,
        body: FeatLifecycleCommandSchema,
        response: { 200: ResponseFeatFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreFeatController.handle,
  );

  app.post(
    "/feats/:featId/validate",
    {
      config: { permission: { key: FEATS_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateSystemFeat",
        security,
        params: RequestSystemFeatParamsSchema,
        response: { 200: ResponseFeatValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateFeatController.handle,
  );
}
