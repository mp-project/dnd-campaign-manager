import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { errorResponseDto } from "#core/http/dto";
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
import type {
  ListBackgroundCatalogController,
  ListCampaignBackgroundsController,
  ListSystemBackgroundsController,
} from "#src/modules/backgrounds/http/controller/ListBackgroundsControllers";
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

const security = [{ cookieAuth: [] }] as const;
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

type Handler = (request: never) => Promise<unknown>;

const created =
  (handle: Handler) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
    reply.code(201).send(await handle(request as never));

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
    controllers.listCampaignBackgroundsController.handle,
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
    created(controllers.createBackgroundController.handle),
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
    controllers.getCampaignBackgroundController.handle,
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
    controllers.updateBackgroundController.handle,
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
    controllers.deleteBackgroundController.handle,
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
    controllers.restoreBackgroundController.handle,
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
    controllers.validateBackgroundController.handle,
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
    controllers.getCampaignBackgroundUsagesController.handle,
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
    controllers.listBackgroundCatalogController.handle,
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
    controllers.getCatalogBackgroundController.handle,
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
      controllers.catalogSectionControllers[section].handle,
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
    controllers.getCatalogBackgroundUsagesController.handle,
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
    controllers.resolveBackgroundController.handle,
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
    controllers.getBackgroundFeatOptionsController.handle,
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
    controllers.listSystemBackgroundsController.handle,
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
    created(controllers.createBackgroundController.handle),
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
    controllers.getSystemBackgroundController.handle,
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
    controllers.updateBackgroundController.handle,
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
    controllers.deleteBackgroundController.handle,
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
    controllers.restoreBackgroundController.handle,
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
    controllers.validateBackgroundController.handle,
  );
}
