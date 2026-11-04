import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  RequestHistoryActionParamsSchema,
  RequestHistoryEntityParamsSchema,
  RequestHistoryEventParamsSchema,
  RequestHistoryListQuerySchema,
  RequestHistoryVersionParamsSchema,
  RestoreHistoryVersionSchema,
  RevertHistoryActionSchema,
  RevertHistoryEventSchema,
} from "#src/modules/history/domain/dto/RequestHistoryDto";
import {
  ResponseEntityVersionSchema,
  ResponseFieldChangePageSchema,
  ResponseHistoryActionSchema,
} from "#src/modules/history/domain/dto/ResponseHistoryDto";
import { GetHistoryVersionController } from "#src/modules/history/http/controller/GetHistoryVersionController";
import { ListHistoryController } from "#src/modules/history/http/controller/ListHistoryController";
import { RestoreHistoryVersionController } from "#src/modules/history/http/controller/RestoreHistoryVersionController";
import { RevertHistoryActionController } from "#src/modules/history/http/controller/RevertHistoryActionController";
import { RevertHistoryEventController } from "#src/modules/history/http/controller/RevertHistoryEventController";
import { HISTORY_PERMISSIONS } from "#src/modules/history/permissions/HistoryPermissions";

export type HistoryRouteControllers = {
  listHistoryController: ListHistoryController;
  getHistoryVersionController: GetHistoryVersionController;
  revertHistoryEventController: RevertHistoryEventController;
  revertHistoryActionController: RevertHistoryActionController;
  restoreHistoryVersionController: RestoreHistoryVersionController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["history"];

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

/**
 * Route permissions only open these paths. The service takes the campaign from the stored data
 * and never from the `x-campaign-id` header or the path.
 */
export function registerHistoryRoutes(
  app: FastifyInstance,
  controllers: HistoryRouteControllers,
): void {
  app.get(
    "/history/:entityType/:entityId",
    {
      config: { permission: { key: HISTORY_PERMISSIONS.read } },
      schema: {
        tags,
        security,
        params: RequestHistoryEntityParamsSchema,
        querystring: RequestHistoryListQuerySchema,
        response: { 200: ResponseFieldChangePageSchema, ...readErrorResponses },
      },
    },
    controllers.listHistoryController.handle,
  );

  app.get(
    "/history/:entityType/:entityId/versions/:version",
    {
      config: { permission: { key: HISTORY_PERMISSIONS.read } },
      schema: {
        tags,
        security,
        params: RequestHistoryVersionParamsSchema,
        response: { 200: ResponseEntityVersionSchema, ...readErrorResponses },
      },
    },
    controllers.getHistoryVersionController.handle,
  );

  app.post(
    "/history/:entityType/:entityId/versions/:version/restore",
    {
      config: { permission: { key: HISTORY_PERMISSIONS.restore } },
      schema: {
        tags,
        security,
        params: RequestHistoryVersionParamsSchema,
        body: RestoreHistoryVersionSchema,
        response: { 200: ResponseHistoryActionSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreHistoryVersionController.handle,
  );

  app.post(
    "/history/events/:eventId/revert",
    {
      config: { permission: { key: HISTORY_PERMISSIONS.revert } },
      schema: {
        tags,
        security,
        params: RequestHistoryEventParamsSchema,
        body: RevertHistoryEventSchema,
        response: { 200: ResponseHistoryActionSchema, ...writeErrorResponses },
      },
    },
    controllers.revertHistoryEventController.handle,
  );

  app.post(
    "/history/actions/:actionId/revert",
    {
      config: { permission: { key: HISTORY_PERMISSIONS.revert } },
      schema: {
        tags,
        security,
        params: RequestHistoryActionParamsSchema,
        body: RevertHistoryActionSchema,
        response: { 200: ResponseHistoryActionSchema, ...writeErrorResponses },
      },
    },
    controllers.revertHistoryActionController.handle,
  );
}
