import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { CreateTagSchema } from "#src/modules/tags/domain/dto/CreateTagDto";
import {
  RequestAssetTagsParamsSchema,
  RequestDeleteTagQuerySchema,
  RequestTagItemParamsSchema,
  RequestTagsParamsSchema,
  RequestTagsQuerySchema,
} from "#src/modules/tags/domain/dto/RequestTagDto";
import {
  ResponseAssetTagsSchema,
  ResponseReplaceAssetTagsSchema,
  ResponseTagGmSchema,
  ResponseTagListSchema,
  ResponseUpdateTagSchema,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import {
  ReplaceAssetTagsSchema,
  UpdateTagSchema,
} from "#src/modules/tags/domain/dto/UpdateTagDto";
import { CreateTagController } from "#src/modules/tags/http/controller/CreateTagController";
import { DeleteTagController } from "#src/modules/tags/http/controller/DeleteTagController";
import { ListAssetTagsController } from "#src/modules/tags/http/controller/ListAssetTagsController";
import { ListTagsController } from "#src/modules/tags/http/controller/ListTagsController";
import { ReplaceAssetTagsController } from "#src/modules/tags/http/controller/ReplaceAssetTagsController";
import { UpdateTagController } from "#src/modules/tags/http/controller/UpdateTagController";
import { TAGS_PERMISSIONS } from "#src/modules/tags/permissions/TagsPermissions";

export type TagsRouteControllers = {
  listTagsController: ListTagsController;
  createTagController: CreateTagController;
  updateTagController: UpdateTagController;
  deleteTagController: DeleteTagController;
  listAssetTagsController: ListAssetTagsController;
  replaceAssetTagsController: ReplaceAssetTagsController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Tags"];

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

export function registerTagsRoutes(
  app: FastifyInstance,
  controllers: TagsRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/tags",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "listTags",
        security,
        params: RequestTagsParamsSchema,
        querystring: RequestTagsQuerySchema,
        response: {
          200: ResponseTagListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listTagsController.handle,
  );

  app.post(
    "/campaigns/:campaignId/tags",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createTag",
        security,
        params: RequestTagsParamsSchema,
        body: CreateTagSchema,
        response: {
          201: ResponseTagGmSchema,
          ...writeErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createTagController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/campaigns/:campaignId/tags/:tagId",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateTag",
        security,
        params: RequestTagItemParamsSchema,
        body: UpdateTagSchema,
        response: {
          200: ResponseUpdateTagSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.updateTagController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/tags/:tagId",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.delete },
      },
      schema: {
        tags,
        operationId: "deleteTag",
        security,
        params: RequestTagItemParamsSchema,
        querystring: RequestDeleteTagQuerySchema,
        response: {
          204: z.null(),
          400: errorResponseDto,
          ...readErrorResponses,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteTagController.handle(request);

      return reply.code(204).send();
    },
  );

  app.get(
    "/campaigns/:campaignId/assets/:assetId/tags",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "listAssetTags",
        security,
        params: RequestAssetTagsParamsSchema,
        response: {
          200: ResponseAssetTagsSchema,
          ...readErrorResponses,
        },
      },
    },
    controllers.listAssetTagsController.handle,
  );

  app.put(
    "/campaigns/:campaignId/assets/:assetId/tags",
    {
      config: {
        permission: { key: TAGS_PERMISSIONS.assign },
      },
      schema: {
        tags,
        operationId: "replaceAssetTags",
        security,
        params: RequestAssetTagsParamsSchema,
        body: ReplaceAssetTagsSchema,
        response: {
          200: ResponseReplaceAssetTagsSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.replaceAssetTagsController.handle,
  );
}
