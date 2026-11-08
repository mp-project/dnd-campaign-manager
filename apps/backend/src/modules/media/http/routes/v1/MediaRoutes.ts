import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { MEDIA_READ_ROUTE_RATE_LIMIT } from "#core/http/rateLimit";
import {
  AttachMediaSchema,
  CreateMediaUploadSchema,
  RequestAssetMediaItemParamsSchema,
  RequestAssetMediaParamsSchema,
  RequestMediaContentQuerySchema,
  RequestMediaItemParamsSchema,
  RequestMediaParamsSchema,
  RequestMediaQuerySchema,
  RequestMediaUploadParamsSchema,
  RequestMediaUploadPartParamsSchema,
  UpdateAssetMediaSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import {
  ResponseAssetMediaFullSchema,
  ResponseAssetMediaListSchema,
  ResponseCompleteMediaUploadSchema,
  ResponseCreateMediaUploadSchema,
  ResponseMediaListSchema,
  ResponseMediaRemovedSchema,
  ResponseMediaSchema,
  ResponseMediaUploadPartSchema,
  ResponseMediaUploadSchema,
  ResponseUpdateAssetMediaSchema,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import { AbortMediaUploadController } from "#src/modules/media/http/controller/AbortMediaUploadController";
import { AttachMediaController } from "#src/modules/media/http/controller/AttachMediaController";
import { CompleteMediaUploadController } from "#src/modules/media/http/controller/CompleteMediaUploadController";
import { CreateMediaUploadController } from "#src/modules/media/http/controller/CreateMediaUploadController";
import { DeleteMediaController } from "#src/modules/media/http/controller/DeleteMediaController";
import { DetachMediaController } from "#src/modules/media/http/controller/DetachMediaController";
import { GetMediaContentController } from "#src/modules/media/http/controller/GetMediaContentController";
import { GetMediaController } from "#src/modules/media/http/controller/GetMediaController";
import { GetMediaUploadController } from "#src/modules/media/http/controller/GetMediaUploadController";
import { ListAssetMediaController } from "#src/modules/media/http/controller/ListAssetMediaController";
import { ListMediaController } from "#src/modules/media/http/controller/ListMediaController";
import { UpdateAssetMediaController } from "#src/modules/media/http/controller/UpdateAssetMediaController";
import { UploadMediaPartController } from "#src/modules/media/http/controller/UploadMediaPartController";
import { MEDIA_PERMISSIONS } from "#src/modules/media/permissions/MediaPermissions";

export type MediaRouteControllers = {
  listMediaController: ListMediaController;
  createMediaUploadController: CreateMediaUploadController;
  getMediaUploadController: GetMediaUploadController;
  uploadMediaPartController: UploadMediaPartController;
  completeMediaUploadController: CompleteMediaUploadController;
  abortMediaUploadController: AbortMediaUploadController;
  getMediaController: GetMediaController;
  getMediaContentController: GetMediaContentController;
  deleteMediaController: DeleteMediaController;
  listAssetMediaController: ListAssetMediaController;
  attachMediaController: AttachMediaController;
  updateAssetMediaController: UpdateAssetMediaController;
  detachMediaController: DetachMediaController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Media"];

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

export function registerMediaRoutes(
  app: FastifyInstance,
  controllers: MediaRouteControllers,
): void {
  app.get(
    "/campaigns/:campaignId/media",
    {
      config: {
        permission: { key: MEDIA_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
        rateLimit: MEDIA_READ_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "listMedia",
        security,
        params: RequestMediaParamsSchema,
        querystring: RequestMediaQuerySchema,
        response: { 200: ResponseMediaListSchema, 400: errorResponseDto, ...readErrorResponses },
      },
    },
    controllers.listMediaController.handle,
  );

  app.post(
    "/campaigns/:campaignId/media/uploads",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.upload } },
      schema: {
        tags,
        operationId: "createMediaUpload",
        description:
          "Announces a file and checks the limits of the campaign owner. Then send the parts and complete the upload.",
        security,
        params: RequestMediaParamsSchema,
        body: CreateMediaUploadSchema,
        response: {
          201: ResponseCreateMediaUploadSchema,
          400: errorResponseDto,
          ...readErrorResponses,
          413: errorResponseDto,
          415: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createMediaUploadController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.get(
    "/campaigns/:campaignId/media/uploads/:uploadId",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.upload } },
      schema: {
        tags,
        operationId: "getMediaUpload",
        description: "Tells which parts have arrived, so an interrupted upload can continue.",
        security,
        params: RequestMediaUploadParamsSchema,
        response: { 200: ResponseMediaUploadSchema, ...readErrorResponses },
      },
    },
    controllers.getMediaUploadController.handle,
  );

  app.put(
    "/campaigns/:campaignId/media/uploads/:uploadId/parts/:partNumber",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.upload } },
      schema: {
        tags,
        operationId: "uploadMediaPart",
        description:
          "Body: the bytes of one part as application/octet-stream. Parts can arrive in any order and be sent again.",
        consumes: ["application/octet-stream"],
        security,
        params: RequestMediaUploadPartParamsSchema,
        response: { 200: ResponseMediaUploadPartSchema, ...writeErrorResponses },
      },
    },
    controllers.uploadMediaPartController.handle,
  );

  app.post(
    "/campaigns/:campaignId/media/uploads/:uploadId/complete",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.upload } },
      schema: {
        tags,
        operationId: "completeMediaUpload",
        description:
          "Joins the parts and checks the content. Answers 409 with `missingParts` if some are missing.",
        security,
        params: RequestMediaUploadParamsSchema,
        response: {
          201: ResponseCompleteMediaUploadSchema,
          ...writeErrorResponses,
          415: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.completeMediaUploadController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.delete(
    "/campaigns/:campaignId/media/uploads/:uploadId",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.upload } },
      schema: {
        tags,
        operationId: "abortMediaUpload",
        security,
        params: RequestMediaUploadParamsSchema,
        response: { 200: ResponseMediaRemovedSchema, ...readErrorResponses, 409: errorResponseDto },
      },
    },
    controllers.abortMediaUploadController.handle,
  );

  app.get(
    "/campaigns/:campaignId/media/:mediaId",
    {
      config: {
        permission: { key: MEDIA_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
        rateLimit: MEDIA_READ_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "getMedia",
        security,
        params: RequestMediaItemParamsSchema,
        response: { 200: ResponseMediaSchema, ...readErrorResponses },
      },
    },
    controllers.getMediaController.handle,
  );

  app.get(
    "/campaigns/:campaignId/media/:mediaId/content",
    {
      config: {
        permission: { key: MEDIA_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
        rateLimit: MEDIA_READ_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "getMediaContent",
        description:
          "Checks the rights of the viewer, then redirects to a short-lived link. `variant` asks for a smaller WebP version of an image.",
        security,
        params: RequestMediaItemParamsSchema,
        querystring: RequestMediaContentQuerySchema,
        response: readErrorResponses,
      },
    },
    async (request, reply) => {
      const content = await controllers.getMediaContentController.handle(request);

      reply.headers(content.headers);

      return "redirectUrl" in content
        ? reply.redirect(content.redirectUrl, 302)
        : reply.send(content.stream);
    },
  );

  app.delete(
    "/campaigns/:campaignId/media/:mediaId",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteMedia",
        security,
        params: RequestMediaItemParamsSchema,
        response: { 200: ResponseMediaRemovedSchema, ...readErrorResponses, 409: errorResponseDto },
      },
    },
    controllers.deleteMediaController.handle,
  );

  app.get(
    "/campaigns/:campaignId/assets/:assetId/media",
    {
      config: {
        permission: { key: MEDIA_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
        rateLimit: MEDIA_READ_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "listAssetMedia",
        security,
        params: RequestAssetMediaParamsSchema,
        response: { 200: ResponseAssetMediaListSchema, ...readErrorResponses },
      },
    },
    controllers.listAssetMediaController.handle,
  );

  app.post(
    "/campaigns/:campaignId/assets/:assetId/media",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.attach } },
      schema: {
        tags,
        operationId: "attachMedia",
        security,
        params: RequestAssetMediaParamsSchema,
        body: AttachMediaSchema,
        response: { 201: ResponseAssetMediaFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => {
      const created = await controllers.attachMediaController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/campaigns/:campaignId/assets/:assetId/media/:assignmentId",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateAssetMedia",
        security,
        params: RequestAssetMediaItemParamsSchema,
        body: UpdateAssetMediaSchema,
        response: { 200: ResponseUpdateAssetMediaSchema, ...writeErrorResponses },
      },
    },
    controllers.updateAssetMediaController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/assets/:assetId/media/:assignmentId",
    {
      config: { permission: { key: MEDIA_PERMISSIONS.attach } },
      schema: {
        tags,
        operationId: "detachMedia",
        security,
        params: RequestAssetMediaItemParamsSchema,
        response: { 204: z.null(), ...readErrorResponses },
      },
    },
    async (request, reply) => {
      await controllers.detachMediaController.handle(request);

      return reply.code(204).send();
    },
  );
}
