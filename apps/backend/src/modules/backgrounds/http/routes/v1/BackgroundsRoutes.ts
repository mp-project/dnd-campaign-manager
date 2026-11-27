import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { sendHttpResponse } from "#core/http/httpResponse";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateBackgroundSchema } from "#src/modules/backgrounds/domain/dto/CreateBackgroundDto";
import {
  BackgroundFeatOptionsSchema,
  RequestBackgroundCatalogQuerySchema,
  RequestCampaignBackgroundParamsSchema,
  RequestCampaignBackgroundsParamsSchema,
  RequestCampaignBackgroundsQuerySchema,
  RequestSystemBackgroundParamsSchema,
  RequestSystemBackgroundsQuerySchema,
  ResolveBackgroundSchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import {
  BACKGROUND_SECTIONS,
  type BackgroundSection,
  ResponseBackgroundFeatOptionsSchema,
  ResponseBackgroundFullSchema,
  ResponseBackgroundListSchema,
  ResponseBackgroundResolutionSchema,
  ResponseBackgroundSchema,
  ResponseBackgroundSectionSchemas,
  ResponseBackgroundValidationSchema,
  ResponseUpdateBackgroundSchema,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import {
  BackgroundLifecycleCommandSchema,
  UpdateBackgroundSchema,
} from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import type { CreateBackgroundController } from "#src/modules/backgrounds/http/controller/CreateBackgroundController";
import type { DeleteBackgroundController } from "#src/modules/backgrounds/http/controller/DeleteBackgroundController";
import type { GetBackgroundController } from "#src/modules/backgrounds/http/controller/GetBackgroundController";
import type { GetBackgroundFeatOptionsController } from "#src/modules/backgrounds/http/controller/GetBackgroundFeatOptionsController";
import type { GetBackgroundSectionController } from "#src/modules/backgrounds/http/controller/GetBackgroundSectionController";
import type { GetBackgroundUsagesController } from "#src/modules/backgrounds/http/controller/GetBackgroundUsagesController";
import type { ListBackgroundCatalogController } from "#src/modules/backgrounds/http/controller/ListBackgroundCatalogController";
import type { ListCampaignBackgroundsController } from "#src/modules/backgrounds/http/controller/ListCampaignBackgroundsController";
import type { ListSystemBackgroundsController } from "#src/modules/backgrounds/http/controller/ListSystemBackgroundsController";
import type { ResolveBackgroundController } from "#src/modules/backgrounds/http/controller/ResolveBackgroundController";
import type { RestoreBackgroundController } from "#src/modules/backgrounds/http/controller/RestoreBackgroundController";
import type { UpdateBackgroundController } from "#src/modules/backgrounds/http/controller/UpdateBackgroundController";
import type { ValidateBackgroundController } from "#src/modules/backgrounds/http/controller/ValidateBackgroundController";
import { BACKGROUNDS_PERMISSIONS } from "#src/modules/backgrounds/permissions/BackgroundsPermissions";

export type BackgroundsRouteControllers = {
  listCampaignBackgroundsController: ListCampaignBackgroundsController;
  listBackgroundCatalogController: ListBackgroundCatalogController;
  listSystemBackgroundsController: ListSystemBackgroundsController;
  getCampaignBackgroundController: GetBackgroundController;
  getCatalogBackgroundController: GetBackgroundController;
  getSystemBackgroundController: GetBackgroundController;
  catalogSectionControllers: Record<BackgroundSection, GetBackgroundSectionController>;
  getCampaignBackgroundUsagesController: GetBackgroundUsagesController;
  getCatalogBackgroundUsagesController: GetBackgroundUsagesController;
  resolveBackgroundController: ResolveBackgroundController;
  getBackgroundFeatOptionsController: GetBackgroundFeatOptionsController;
  createBackgroundController: CreateBackgroundController;
  updateBackgroundController: UpdateBackgroundController;
  deleteBackgroundController: DeleteBackgroundController;
  restoreBackgroundController: RestoreBackgroundController;
  validateBackgroundController: ValidateBackgroundController;
};

const security = [{ bearerAuth: [] }] as const;
const tags = ["Backgrounds"];

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

const campaignRead = { key: BACKGROUNDS_PERMISSIONS.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: BACKGROUNDS_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true };
const campaignResolve = { key: BACKGROUNDS_PERMISSIONS.resolve, hideAsNotFoundForPlayers: true };

const sectionOperation = (section: BackgroundSection) =>
  `getCatalogBackground${section.charAt(0).toUpperCase()}${section.slice(1)}`;

/**
 * Custom backgrounds under `/campaigns/:campaignId/backgrounds`, the catalog of everything a
 * campaign may choose under `/campaigns/:campaignId/catalog/backgrounds` (with sections and the
 * preview of a character's choices), global backgrounds under `/backgrounds`. Global backgrounds use
 * the same permissions; the use case only lets administrators change them. The parts of a
 * definition are replaced with `PATCH`, there are no separate routes per part. Assigning a
 * background to a character comes with the character modules.
 */
export function registerBackgroundsRoutes(app: FastifyInstance, controllers: BackgroundsRouteControllers): void {
  // ---------------------------------------------------------------------------
  // Custom backgrounds of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/backgrounds",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCampaignBackgrounds",
        security,
        params: RequestCampaignBackgroundsParamsSchema,
        querystring: RequestCampaignBackgroundsQuerySchema,
        response: { 200: ResponseBackgroundListSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listCampaignBackgroundsController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/backgrounds",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createCampaignBackground",
        security,
        params: RequestCampaignBackgroundsParamsSchema,
        body: CreateBackgroundSchema,
        response: { 201: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.createBackgroundController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/backgrounds/:backgroundId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCampaignBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        response: { 200: ResponseBackgroundSchema, ...definitionReadErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCampaignBackgroundController.handle(request)),
  );

  app.patch(
    "/campaigns/:campaignId/backgrounds/:backgroundId",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateCampaignBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        body: UpdateBackgroundSchema,
        response: { 200: ResponseUpdateBackgroundSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.updateBackgroundController.handle(request)),
  );

  app.delete(
    "/campaigns/:campaignId/backgrounds/:backgroundId",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteCampaignBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        querystring: BackgroundLifecycleCommandSchema,
        response: { 200: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.deleteBackgroundController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/backgrounds/:backgroundId/restore",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreCampaignBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        body: BackgroundLifecycleCommandSchema,
        response: { 200: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.restoreBackgroundController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/backgrounds/:backgroundId/validate",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateCampaignBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        response: { 200: ResponseBackgroundValidationSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.validateBackgroundController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/backgrounds/:backgroundId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCampaignBackgroundUsages",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCampaignBackgroundUsagesController.handle(request)),
  );

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/catalog/backgrounds",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listBackgroundCatalog",
        security,
        params: RequestCampaignBackgroundsParamsSchema,
        querystring: RequestBackgroundCatalogQuerySchema,
        response: { 200: ResponseBackgroundListSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listBackgroundCatalogController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/catalog/backgrounds/:backgroundId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCatalogBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        response: { 200: ResponseBackgroundSchema, ...definitionReadErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCatalogBackgroundController.handle(request)),
  );

  for (const section of BACKGROUND_SECTIONS) {
    app.get(
      `/campaigns/:campaignId/catalog/backgrounds/:backgroundId/${section}`,
      {
        config: { permission: campaignRead },
        schema: {
          tags,
          operationId: sectionOperation(section),
          security,
          params: RequestCampaignBackgroundParamsSchema,
          response: { 200: ResponseBackgroundSectionSchemas[section], ...definitionReadErrorResponses },
        },
      },
      async (request, reply) => sendHttpResponse(reply, await controllers.catalogSectionControllers[section].handle(request)),
    );
  }

  app.get(
    "/campaigns/:campaignId/catalog/backgrounds/:backgroundId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCatalogBackgroundUsages",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCatalogBackgroundUsagesController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/catalog/backgrounds/:backgroundId/resolve",
    {
      config: { permission: campaignResolve },
      schema: {
        tags,
        operationId: "resolveBackground",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        body: ResolveBackgroundSchema,
        response: { 200: ResponseBackgroundResolutionSchema, ...definitionReadErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.resolveBackgroundController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/catalog/backgrounds/:backgroundId/feat-options",
    {
      config: { permission: campaignResolve },
      schema: {
        tags,
        operationId: "getBackgroundFeatOptions",
        security,
        params: RequestCampaignBackgroundParamsSchema,
        body: BackgroundFeatOptionsSchema,
        response: { 200: ResponseBackgroundFeatOptionsSchema, ...definitionReadErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getBackgroundFeatOptionsController.handle(request)),
  );

  // ---------------------------------------------------------------------------
  // Global backgrounds
  // ---------------------------------------------------------------------------

  app.get(
    "/backgrounds",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listSystemBackgrounds",
        security,
        querystring: RequestSystemBackgroundsQuerySchema,
        response: { 200: ResponseBackgroundListSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listSystemBackgroundsController.handle(request)),
  );

  app.post(
    "/backgrounds",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createSystemBackground",
        security,
        body: CreateBackgroundSchema,
        response: { 201: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.createBackgroundController.handle(request)),
  );

  app.get(
    "/backgrounds/:backgroundId",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "getSystemBackground",
        security,
        params: RequestSystemBackgroundParamsSchema,
        response: { 200: ResponseBackgroundSchema, ...definitionReadErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getSystemBackgroundController.handle(request)),
  );

  app.patch(
    "/backgrounds/:backgroundId",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateSystemBackground",
        security,
        params: RequestSystemBackgroundParamsSchema,
        body: UpdateBackgroundSchema,
        response: { 200: ResponseUpdateBackgroundSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.updateBackgroundController.handle(request)),
  );

  app.delete(
    "/backgrounds/:backgroundId",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteSystemBackground",
        security,
        params: RequestSystemBackgroundParamsSchema,
        querystring: BackgroundLifecycleCommandSchema,
        response: { 200: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.deleteBackgroundController.handle(request)),
  );

  app.post(
    "/backgrounds/:backgroundId/restore",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreSystemBackground",
        security,
        params: RequestSystemBackgroundParamsSchema,
        body: BackgroundLifecycleCommandSchema,
        response: { 200: ResponseBackgroundFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.restoreBackgroundController.handle(request)),
  );

  app.post(
    "/backgrounds/:backgroundId/validate",
    {
      config: { permission: { key: BACKGROUNDS_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateSystemBackground",
        security,
        params: RequestSystemBackgroundParamsSchema,
        response: { 200: ResponseBackgroundValidationSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.validateBackgroundController.handle(request)),
  );
}
