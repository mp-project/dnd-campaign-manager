import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { sendHttpResponse } from "#core/http/httpResponse";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateSubclassSchema } from "#src/modules/subclasses/domain/dto/CreateSubclassDto";
import {
  RequestCampaignSubclassesParamsSchema,
  RequestCampaignSubclassesQuerySchema,
  RequestCampaignSubclassParamsSchema,
  RequestCatalogClassSubclassesParamsSchema,
  RequestSubclassSelectionCheckSchema,
  RequestSystemSubclassesQuerySchema,
  RequestSystemSubclassParamsSchema,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import {
  ResponseClassSubclassesSchema,
  ResponseSubclassFullSchema,
  ResponseSubclassListSchema,
  ResponseSubclassSchema,
  ResponseSubclassSectionSchemas,
  ResponseSubclassSelectionCheckSchema,
  ResponseSubclassValidationSchema,
  ResponseUpdateSubclassSchema,
  SUBCLASS_SECTIONS,
  type SubclassSection,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import {
  SubclassLifecycleCommandSchema,
  UpdateSubclassSchema,
} from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import type { CheckSubclassSelectionController } from "#src/modules/subclasses/http/controller/CheckSubclassSelectionController";
import type { CreateSubclassController } from "#src/modules/subclasses/http/controller/CreateSubclassController";
import type { DeleteSubclassController } from "#src/modules/subclasses/http/controller/DeleteSubclassController";
import type { GetSubclassController } from "#src/modules/subclasses/http/controller/GetSubclassController";
import type { GetSubclassSectionController } from "#src/modules/subclasses/http/controller/GetSubclassSectionController";
import type { GetSubclassUsagesController } from "#src/modules/subclasses/http/controller/GetSubclassUsagesController";
import type { ListCampaignSubclassesController } from "#src/modules/subclasses/http/controller/ListCampaignSubclassesController";
import type { ListClassSubclassesController } from "#src/modules/subclasses/http/controller/ListClassSubclassesController";
import type { ListSystemSubclassesController } from "#src/modules/subclasses/http/controller/ListSystemSubclassesController";
import type { RestoreSubclassController } from "#src/modules/subclasses/http/controller/RestoreSubclassController";
import type { UpdateSubclassController } from "#src/modules/subclasses/http/controller/UpdateSubclassController";
import type { ValidateSubclassController } from "#src/modules/subclasses/http/controller/ValidateSubclassController";
import { SUBCLASSES_PERMISSIONS } from "#src/modules/subclasses/permissions/SubclassesPermissions";

export type SubclassesRouteControllers = {
  listCampaignSubclassesController: ListCampaignSubclassesController;
  listClassSubclassesController: ListClassSubclassesController;
  listSystemSubclassesController: ListSystemSubclassesController;
  getCampaignSubclassController: GetSubclassController;
  getCatalogSubclassController: GetSubclassController;
  getSystemSubclassController: GetSubclassController;
  catalogSectionControllers: Record<SubclassSection, GetSubclassSectionController>;
  checkSubclassSelectionController: CheckSubclassSelectionController;
  createSubclassController: CreateSubclassController;
  updateSubclassController: UpdateSubclassController;
  deleteSubclassController: DeleteSubclassController;
  restoreSubclassController: RestoreSubclassController;
  validateSubclassController: ValidateSubclassController;
  getCampaignSubclassUsagesController: GetSubclassUsagesController;
  getCatalogSubclassUsagesController: GetSubclassUsagesController;
};

const security = [{ bearerAuth: [] }] as const;
const tags = ["Subclasses"];

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

const campaignRead = { key: SUBCLASSES_PERMISSIONS.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: SUBCLASSES_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true };

const pascal = (section: string) => section.charAt(0).toUpperCase() + section.slice(1);

/**
 * Custom subclasses under `/campaigns/:campaignId/subclasses`, the catalog (the subclasses of a
 * class under `/campaigns/:campaignId/catalog/classes/:classId/subclasses`, details with one route
 * per section under `/campaigns/:campaignId/catalog/subclasses/:subclassId`), global subclasses
 * under `/subclasses`. Global subclasses use the same permissions; the use case only lets
 * administrators change them.
 */
export function registerSubclassesRoutes(
  app: FastifyInstance,
  controllers: SubclassesRouteControllers,
): void {
  // ---------------------------------------------------------------------------
  // Custom subclasses of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/subclasses",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCampaignSubclasses",
        security,
        params: RequestCampaignSubclassesParamsSchema,
        querystring: RequestCampaignSubclassesQuerySchema,
        response: { 200: ResponseSubclassListSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listCampaignSubclassesController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/subclasses",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createCampaignSubclass",
        security,
        params: RequestCampaignSubclassesParamsSchema,
        body: CreateSubclassSchema,
        response: { 201: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.createSubclassController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/subclasses/:subclassId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCampaignSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        response: { 200: ResponseSubclassSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCampaignSubclassController.handle(request)),
  );

  app.patch(
    "/campaigns/:campaignId/subclasses/:subclassId",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateCampaignSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        body: UpdateSubclassSchema,
        response: { 200: ResponseUpdateSubclassSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.updateSubclassController.handle(request)),
  );

  app.delete(
    "/campaigns/:campaignId/subclasses/:subclassId",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteCampaignSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        querystring: SubclassLifecycleCommandSchema,
        response: { 200: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.deleteSubclassController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/subclasses/:subclassId/restore",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreCampaignSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        body: SubclassLifecycleCommandSchema,
        response: { 200: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.restoreSubclassController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/subclasses/:subclassId/validate",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateCampaignSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        response: { 200: ResponseSubclassValidationSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.validateSubclassController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/subclasses/:subclassId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCampaignSubclassUsages",
        security,
        params: RequestCampaignSubclassParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCampaignSubclassUsagesController.handle(request)),
  );

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/catalog/classes/:classId/subclasses",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCatalogClassSubclasses",
        security,
        params: RequestCatalogClassSubclassesParamsSchema,
        response: { 200: ResponseClassSubclassesSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listClassSubclassesController.handle(request)),
  );

  app.get(
    "/campaigns/:campaignId/catalog/subclasses/:subclassId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCatalogSubclass",
        security,
        params: RequestCampaignSubclassParamsSchema,
        response: { 200: ResponseSubclassSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCatalogSubclassController.handle(request)),
  );

  for (const section of SUBCLASS_SECTIONS) {
    app.get(
      `/campaigns/:campaignId/catalog/subclasses/:subclassId/${section}`,
      {
        config: { permission: campaignRead },
        schema: {
          tags,
          operationId: `getCatalogSubclass${pascal(section)}`,
          security,
          params: RequestCampaignSubclassParamsSchema,
          response: { 200: ResponseSubclassSectionSchemas[section], ...readErrorResponses },
        },
      },
      async (request, reply) => sendHttpResponse(reply, await controllers.catalogSectionControllers[section].handle(request)),
    );
  }

  app.get(
    "/campaigns/:campaignId/catalog/subclasses/:subclassId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCatalogSubclassUsages",
        security,
        params: RequestCampaignSubclassParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getCatalogSubclassUsagesController.handle(request)),
  );

  app.post(
    "/campaigns/:campaignId/catalog/subclasses/:subclassId/selection-check",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "checkCatalogSubclassSelection",
        security,
        params: RequestCampaignSubclassParamsSchema,
        body: RequestSubclassSelectionCheckSchema,
        response: { 200: ResponseSubclassSelectionCheckSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.checkSubclassSelectionController.handle(request)),
  );

  // ---------------------------------------------------------------------------
  // Global subclasses
  // ---------------------------------------------------------------------------

  app.get(
    "/subclasses",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listSystemSubclasses",
        security,
        querystring: RequestSystemSubclassesQuerySchema,
        response: { 200: ResponseSubclassListSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.listSystemSubclassesController.handle(request)),
  );

  app.post(
    "/subclasses",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createSystemSubclass",
        security,
        body: CreateSubclassSchema,
        response: { 201: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.createSubclassController.handle(request)),
  );

  app.get(
    "/subclasses/:subclassId",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "getSystemSubclass",
        security,
        params: RequestSystemSubclassParamsSchema,
        response: { 200: ResponseSubclassSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.getSystemSubclassController.handle(request)),
  );

  app.patch(
    "/subclasses/:subclassId",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateSystemSubclass",
        security,
        params: RequestSystemSubclassParamsSchema,
        body: UpdateSubclassSchema,
        response: { 200: ResponseUpdateSubclassSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.updateSubclassController.handle(request)),
  );

  app.delete(
    "/subclasses/:subclassId",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteSystemSubclass",
        security,
        params: RequestSystemSubclassParamsSchema,
        querystring: SubclassLifecycleCommandSchema,
        response: { 200: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.deleteSubclassController.handle(request)),
  );

  app.post(
    "/subclasses/:subclassId/restore",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreSystemSubclass",
        security,
        params: RequestSystemSubclassParamsSchema,
        body: SubclassLifecycleCommandSchema,
        response: { 200: ResponseSubclassFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.restoreSubclassController.handle(request)),
  );

  app.post(
    "/subclasses/:subclassId/validate",
    {
      config: { permission: { key: SUBCLASSES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateSystemSubclass",
        security,
        params: RequestSystemSubclassParamsSchema,
        response: { 200: ResponseSubclassValidationSchema, ...readErrorResponses },
      },
    },
    async (request, reply) => sendHttpResponse(reply, await controllers.validateSubclassController.handle(request)),
  );
}
