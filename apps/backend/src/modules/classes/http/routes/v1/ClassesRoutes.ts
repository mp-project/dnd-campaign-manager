import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateClassSchema } from "#src/modules/classes/domain/dto/CreateClassDto";
import {
  RequestCampaignClassesParamsSchema,
  RequestCampaignClassesQuerySchema,
  RequestCampaignClassParamsSchema,
  RequestClassCatalogQuerySchema,
  RequestSystemClassesQuerySchema,
  RequestSystemClassParamsSchema,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import {
  CLASS_SECTIONS,
  type ClassSection,
  ResponseClassFullSchema,
  ResponseClassListSchema,
  ResponseClassSchema,
  ResponseClassSectionSchemas,
  ResponseClassValidationSchema,
  ResponseUpdateClassSchema,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import {
  ClassLifecycleCommandSchema,
  UpdateClassSchema,
} from "#src/modules/classes/domain/dto/UpdateClassDto";
import type { CreateClassController } from "#src/modules/classes/http/controller/CreateClassController";
import type { DeleteClassController } from "#src/modules/classes/http/controller/DeleteClassController";
import type { GetClassController } from "#src/modules/classes/http/controller/GetClassController";
import type { GetClassSectionController } from "#src/modules/classes/http/controller/GetClassSectionController";
import type { GetClassUsagesController } from "#src/modules/classes/http/controller/GetClassUsagesController";
import type {
  ListCampaignClassesController,
  ListClassCatalogController,
  ListSystemClassesController,
} from "#src/modules/classes/http/controller/ListClassesControllers";
import type { RestoreClassController } from "#src/modules/classes/http/controller/RestoreClassController";
import type { UpdateClassController } from "#src/modules/classes/http/controller/UpdateClassController";
import type { ValidateClassController } from "#src/modules/classes/http/controller/ValidateClassController";
import { CLASSES_PERMISSIONS } from "#src/modules/classes/permissions/ClassesPermissions";

export type ClassesRouteControllers = {
  listCampaignClassesController: ListCampaignClassesController;
  listClassCatalogController: ListClassCatalogController;
  listSystemClassesController: ListSystemClassesController;
  getCampaignClassController: GetClassController;
  getCatalogClassController: GetClassController;
  getSystemClassController: GetClassController;
  catalogSectionControllers: Record<ClassSection, GetClassSectionController>;
  createClassController: CreateClassController;
  updateClassController: UpdateClassController;
  deleteClassController: DeleteClassController;
  restoreClassController: RestoreClassController;
  validateClassController: ValidateClassController;
  getCampaignClassUsagesController: GetClassUsagesController;
  getCatalogClassUsagesController: GetClassUsagesController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Classes"];

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

const campaignRead = { key: CLASSES_PERMISSIONS.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: CLASSES_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true };

type Handler = (request: never) => Promise<unknown>;

const created =
  (handle: Handler) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
    reply.code(201).send(await handle(request as never));

/** `starting-equipment` → `StartingEquipment`, for operation ids. */
const pascal = (section: string) =>
  section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/**
 * Custom classes under `/campaigns/:campaignId/classes`, the catalog of everything a campaign may
 * choose under `/campaigns/:campaignId/catalog/classes` (with one route per detail section), global
 * classes under `/classes`. Global classes use the same permissions; the use case only lets
 * administrators change them.
 */
export function registerClassesRoutes(
  app: FastifyInstance,
  controllers: ClassesRouteControllers,
): void {
  // ---------------------------------------------------------------------------
  // Custom classes of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/classes",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listCampaignClasses",
        security,
        params: RequestCampaignClassesParamsSchema,
        querystring: RequestCampaignClassesQuerySchema,
        response: { 200: ResponseClassListSchema, ...readErrorResponses },
      },
    },
    controllers.listCampaignClassesController.handle,
  );

  app.post(
    "/campaigns/:campaignId/classes",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createCampaignClass",
        security,
        params: RequestCampaignClassesParamsSchema,
        body: CreateClassSchema,
        response: { 201: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createClassController.handle),
  );

  app.get(
    "/campaigns/:campaignId/classes/:classId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCampaignClass",
        security,
        params: RequestCampaignClassParamsSchema,
        response: { 200: ResponseClassSchema, ...readErrorResponses },
      },
    },
    controllers.getCampaignClassController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/classes/:classId",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateCampaignClass",
        security,
        params: RequestCampaignClassParamsSchema,
        body: UpdateClassSchema,
        response: { 200: ResponseUpdateClassSchema, ...writeErrorResponses },
      },
    },
    controllers.updateClassController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/classes/:classId",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteCampaignClass",
        security,
        params: RequestCampaignClassParamsSchema,
        querystring: ClassLifecycleCommandSchema,
        response: { 200: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteClassController.handle,
  );

  app.post(
    "/campaigns/:campaignId/classes/:classId/restore",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreCampaignClass",
        security,
        params: RequestCampaignClassParamsSchema,
        body: ClassLifecycleCommandSchema,
        response: { 200: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreClassController.handle,
  );

  app.post(
    "/campaigns/:campaignId/classes/:classId/validate",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateCampaignClass",
        security,
        params: RequestCampaignClassParamsSchema,
        response: { 200: ResponseClassValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateClassController.handle,
  );

  app.get(
    "/campaigns/:campaignId/classes/:classId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCampaignClassUsages",
        security,
        params: RequestCampaignClassParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    controllers.getCampaignClassUsagesController.handle,
  );

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  app.get(
    "/campaigns/:campaignId/catalog/classes",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "listClassCatalog",
        security,
        params: RequestCampaignClassesParamsSchema,
        querystring: RequestClassCatalogQuerySchema,
        response: { 200: ResponseClassListSchema, ...readErrorResponses },
      },
    },
    controllers.listClassCatalogController.handle,
  );

  app.get(
    "/campaigns/:campaignId/catalog/classes/:classId",
    {
      config: { permission: campaignRead },
      schema: {
        tags,
        operationId: "getCatalogClass",
        security,
        params: RequestCampaignClassParamsSchema,
        response: { 200: ResponseClassSchema, ...readErrorResponses },
      },
    },
    controllers.getCatalogClassController.handle,
  );

  for (const section of CLASS_SECTIONS) {
    app.get(
      `/campaigns/:campaignId/catalog/classes/:classId/${section}`,
      {
        config: { permission: campaignRead },
        schema: {
          tags,
          operationId: `getCatalogClass${pascal(section)}`,
          security,
          params: RequestCampaignClassParamsSchema,
          response: { 200: ResponseClassSectionSchemas[section], ...readErrorResponses },
        },
      },
      controllers.catalogSectionControllers[section].handle,
    );
  }

  app.get(
    "/campaigns/:campaignId/catalog/classes/:classId/usages",
    {
      config: { permission: campaignUsages },
      schema: {
        tags,
        operationId: "getCatalogClassUsages",
        security,
        params: RequestCampaignClassParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, ...readErrorResponses },
      },
    },
    controllers.getCatalogClassUsagesController.handle,
  );

  // ---------------------------------------------------------------------------
  // Global classes
  // ---------------------------------------------------------------------------

  app.get(
    "/classes",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "listSystemClasses",
        security,
        querystring: RequestSystemClassesQuerySchema,
        response: { 200: ResponseClassListSchema, ...readErrorResponses },
      },
    },
    controllers.listSystemClassesController.handle,
  );

  app.post(
    "/classes",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createSystemClass",
        security,
        body: CreateClassSchema,
        response: { 201: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    created(controllers.createClassController.handle),
  );

  app.get(
    "/classes/:classId",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.read } },
      schema: {
        tags,
        operationId: "getSystemClass",
        security,
        params: RequestSystemClassParamsSchema,
        response: { 200: ResponseClassSchema, ...readErrorResponses },
      },
    },
    controllers.getSystemClassController.handle,
  );

  app.patch(
    "/classes/:classId",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateSystemClass",
        security,
        params: RequestSystemClassParamsSchema,
        body: UpdateClassSchema,
        response: { 200: ResponseUpdateClassSchema, ...writeErrorResponses },
      },
    },
    controllers.updateClassController.handle,
  );

  app.delete(
    "/classes/:classId",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteSystemClass",
        security,
        params: RequestSystemClassParamsSchema,
        querystring: ClassLifecycleCommandSchema,
        response: { 200: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteClassController.handle,
  );

  app.post(
    "/classes/:classId/restore",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreSystemClass",
        security,
        params: RequestSystemClassParamsSchema,
        body: ClassLifecycleCommandSchema,
        response: { 200: ResponseClassFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreClassController.handle,
  );

  app.post(
    "/classes/:classId/validate",
    {
      config: { permission: { key: CLASSES_PERMISSIONS.validate } },
      schema: {
        tags,
        operationId: "validateSystemClass",
        security,
        params: RequestSystemClassParamsSchema,
        response: { 200: ResponseClassValidationSchema, ...readErrorResponses },
      },
    },
    controllers.validateClassController.handle,
  );
}
