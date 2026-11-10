import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { CreateActorSchema } from "#src/modules/actors/domain/dto/CreateActorDto";
import {
  RequestActorItemParamsSchema,
  RequestActorsParamsSchema,
  RequestActorsQuerySchema,
} from "#src/modules/actors/domain/dto/RequestActorDto";
import {
  ResponseActorFullSchema,
  ResponseActorListSchema,
  ResponseActorSchema,
  ResponseUpdateActorSchema,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import { ResponseActorStatBlockSchema } from "#src/modules/actors/domain/dto/ResponseActorStatBlockDto";
import {
  ActorLifecycleCommandSchema,
  UpdateActorSchema,
} from "#src/modules/actors/domain/dto/UpdateActorDto";
import { CreateActorController } from "#src/modules/actors/http/controller/CreateActorController";
import { DeleteActorController } from "#src/modules/actors/http/controller/DeleteActorController";
import { GetActorController } from "#src/modules/actors/http/controller/GetActorController";
import { GetActorStatBlockController } from "#src/modules/actors/http/controller/GetActorStatBlockController";
import { GetActorUsagesController } from "#src/modules/actors/http/controller/GetActorUsagesController";
import { ListActorsController } from "#src/modules/actors/http/controller/ListActorsController";
import { RestoreActorController } from "#src/modules/actors/http/controller/RestoreActorController";
import { UpdateActorController } from "#src/modules/actors/http/controller/UpdateActorController";
import { ACTORS_PERMISSIONS } from "#src/modules/actors/permissions/ActorsPermissions";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";

export type ActorsRouteControllers = {
  listActorsController: ListActorsController;
  getActorController: GetActorController;
  getActorStatBlockController: GetActorStatBlockController;
  getActorUsagesController: GetActorUsagesController;
  createActorController: CreateActorController;
  updateActorController: UpdateActorController;
  deleteActorController: DeleteActorController;
  restoreActorController: RestoreActorController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Actors"];

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

const collection = "/campaigns/:campaignId/actors";
const item = `${collection}/:actorId`;

/**
 * One set of routes for characters, NPCs and monsters; the category is a field and a filter. The
 * category blocks (NPC, monster, player data) come with their own modules under the actor.
 */
export function registerActorsRoutes(app: FastifyInstance, controllers: ActorsRouteControllers): void {
  app.get(
    collection,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.read, hideAsNotFoundForPlayers: true } },
      schema: {
        tags,
        operationId: "listActors",
        security,
        params: RequestActorsParamsSchema,
        querystring: RequestActorsQuerySchema,
        response: { 200: ResponseActorListSchema, 400: errorResponseDto, ...readErrorResponses },
      },
    },
    controllers.listActorsController.handle,
  );

  app.post(
    collection,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.create } },
      schema: {
        tags,
        operationId: "createActor",
        security,
        params: RequestActorsParamsSchema,
        body: CreateActorSchema,
        response: { 201: ResponseActorFullSchema, ...writeErrorResponses },
      },
    },
    async (request, reply) => {
      const created = await controllers.createActorController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.get(
    item,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.read, hideAsNotFoundForPlayers: true } },
      schema: {
        tags,
        operationId: "getActor",
        security,
        params: RequestActorItemParamsSchema,
        response: { 200: ResponseActorSchema, 400: errorResponseDto, ...readErrorResponses },
      },
    },
    controllers.getActorController.handle,
  );

  app.get(
    `${item}/stat-block`,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.readStatBlock, hideAsNotFoundForPlayers: true } },
      schema: {
        tags,
        operationId: "getActorStatBlock",
        security,
        params: RequestActorItemParamsSchema,
        response: {
          200: ResponseActorStatBlockSchema,
          400: errorResponseDto,
          ...readErrorResponses,
          409: errorResponseDto,
        },
      },
    },
    controllers.getActorStatBlockController.handle,
  );

  app.patch(
    item,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.update } },
      schema: {
        tags,
        operationId: "updateActor",
        security,
        params: RequestActorItemParamsSchema,
        body: UpdateActorSchema,
        response: { 200: ResponseUpdateActorSchema, ...writeErrorResponses },
      },
    },
    controllers.updateActorController.handle,
  );

  app.delete(
    item,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.delete } },
      schema: {
        tags,
        operationId: "deleteActor",
        security,
        params: RequestActorItemParamsSchema,
        querystring: ActorLifecycleCommandSchema,
        response: { 200: ResponseActorFullSchema, ...writeErrorResponses },
      },
    },
    controllers.deleteActorController.handle,
  );

  app.post(
    `${item}/restore`,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.restore } },
      schema: {
        tags,
        operationId: "restoreActor",
        security,
        params: RequestActorItemParamsSchema,
        body: ActorLifecycleCommandSchema,
        response: { 200: ResponseActorFullSchema, ...writeErrorResponses },
      },
    },
    controllers.restoreActorController.handle,
  );

  app.get(
    `${item}/usages`,
    {
      config: { permission: { key: ACTORS_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true } },
      schema: {
        tags,
        operationId: "getActorUsages",
        security,
        params: RequestActorItemParamsSchema,
        response: { 200: ResponseAssetUsagesSchema, 400: errorResponseDto, ...readErrorResponses },
      },
    },
    controllers.getActorUsagesController.handle,
  );
}
