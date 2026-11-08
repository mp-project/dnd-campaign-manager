import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { CreateContentShareSchema } from "#src/modules/content-shares/domain/dto/CreateContentShareDto";
import {
  RequestContentShareItemParamsSchema,
  RequestContentSharesParamsSchema,
  RequestContentSharesQuerySchema,
} from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import {
  ResponseContentShareFullSchema,
  ResponseContentShareListSchema,
  ResponseContentShareSchema,
  ResponseSharedContentSchema,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import { UpdateContentShareSchema } from "#src/modules/content-shares/domain/dto/UpdateContentShareDto";
import { CreateContentShareController } from "#src/modules/content-shares/http/controller/CreateContentShareController";
import { GetContentShareController } from "#src/modules/content-shares/http/controller/GetContentShareController";
import { GetSharedContentController } from "#src/modules/content-shares/http/controller/GetSharedContentController";
import { ListContentSharesController } from "#src/modules/content-shares/http/controller/ListContentSharesController";
import { RevokeContentShareController } from "#src/modules/content-shares/http/controller/RevokeContentShareController";
import { UpdateContentShareController } from "#src/modules/content-shares/http/controller/UpdateContentShareController";
import { CONTENT_SHARES_PERMISSIONS } from "#src/modules/content-shares/permissions/ContentSharesPermissions";

export type ContentSharesRouteControllers = {
  listContentSharesController: ListContentSharesController;
  getContentShareController: GetContentShareController;
  getSharedContentController: GetSharedContentController;
  createContentShareController: CreateContentShareController;
  updateContentShareController: UpdateContentShareController;
  revokeContentShareController: RevokeContentShareController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Content shares"];

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

export function registerContentSharesRoutes(
  app: FastifyInstance,
  controllers: ContentSharesRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/shares",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "listContentShares",
        security,
        params: RequestContentSharesParamsSchema,
        querystring: RequestContentSharesQuerySchema,
        response: {
          200: ResponseContentShareListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listContentSharesController.handle,
  );

  app.post(
    "/campaigns/:campaignId/shares",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createContentShare",
        security,
        params: RequestContentSharesParamsSchema,
        body: CreateContentShareSchema,
        response: {
          201: ResponseContentShareFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createContentShareController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.get(
    "/campaigns/:campaignId/shares/:shareId",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "getContentShare",
        security,
        params: RequestContentShareItemParamsSchema,
        response: {
          200: ResponseContentShareSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.getContentShareController.handle,
  );

  app.get(
    "/campaigns/:campaignId/shares/:shareId/content",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "getSharedContent",
        description:
          "The shared content as the owning module shows it to players; `assetType` names that module.",
        security,
        params: RequestContentShareItemParamsSchema,
        response: {
          200: ResponseSharedContentSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.getSharedContentController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/shares/:shareId",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateContentShare",
        security,
        params: RequestContentShareItemParamsSchema,
        body: UpdateContentShareSchema,
        response: {
          200: ResponseContentShareFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.updateContentShareController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/shares/:shareId",
    {
      config: {
        permission: { key: CONTENT_SHARES_PERMISSIONS.revoke },
      },
      schema: {
        tags,
        operationId: "revokeContentShare",
        security,
        params: RequestContentShareItemParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    async (request, reply) => {
      await controllers.revokeContentShareController.handle(request);

      return reply.code(204).send();
    },
  );
}
