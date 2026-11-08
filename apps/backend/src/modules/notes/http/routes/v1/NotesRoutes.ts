import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateNoteSchema } from "#src/modules/notes/domain/dto/CreateNoteDto";
import {
  RequestNoteItemParamsSchema,
  RequestNotesParamsSchema,
  RequestNotesQuerySchema,
} from "#src/modules/notes/domain/dto/RequestNoteDto";
import {
  ResponseNoteFullSchema,
  ResponseNoteListSchema,
  ResponseNoteSchema,
  ResponseUpdateNoteSchema,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import {
  NoteLifecycleCommandSchema,
  UpdateNoteSchema,
} from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { CreateNoteController } from "#src/modules/notes/http/controller/CreateNoteController";
import { DeleteNoteController } from "#src/modules/notes/http/controller/DeleteNoteController";
import { GetNoteController } from "#src/modules/notes/http/controller/GetNoteController";
import { GetNoteUsagesController } from "#src/modules/notes/http/controller/GetNoteUsagesController";
import { ListNotesController } from "#src/modules/notes/http/controller/ListNotesController";
import { RestoreNoteController } from "#src/modules/notes/http/controller/RestoreNoteController";
import { UpdateNoteController } from "#src/modules/notes/http/controller/UpdateNoteController";
import { NOTES_PERMISSIONS } from "#src/modules/notes/permissions/NotesPermissions";

export type NotesRouteControllers = {
  listNotesController: ListNotesController;
  getNoteController: GetNoteController;
  getNoteUsagesController: GetNoteUsagesController;
  createNoteController: CreateNoteController;
  updateNoteController: UpdateNoteController;
  deleteNoteController: DeleteNoteController;
  restoreNoteController: RestoreNoteController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Notes"];

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

export function registerNotesRoutes(app: FastifyInstance, controllers: NotesRouteControllers): void {
  app.get(
    "/campaigns/:campaignId/notes",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "listNotes",
        security,
        params: RequestNotesParamsSchema,
        querystring: RequestNotesQuerySchema,
        response: {
          200: ResponseNoteListSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.listNotesController.handle,
  );

  app.post(
    "/campaigns/:campaignId/notes",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createNote",
        security,
        params: RequestNotesParamsSchema,
        body: CreateNoteSchema,
        response: {
          201: ResponseNoteFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const created = await controllers.createNoteController.handle(request);

      return reply.code(201).send(created);
    },
  );

  app.get(
    "/campaigns/:campaignId/notes/:noteId",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.read, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "getNote",
        security,
        params: RequestNoteItemParamsSchema,
        response: {
          200: ResponseNoteSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.getNoteController.handle,
  );

  app.patch(
    "/campaigns/:campaignId/notes/:noteId",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateNote",
        security,
        params: RequestNoteItemParamsSchema,
        body: UpdateNoteSchema,
        response: {
          200: ResponseUpdateNoteSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.updateNoteController.handle,
  );

  app.delete(
    "/campaigns/:campaignId/notes/:noteId",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.delete },
      },
      schema: {
        tags,
        operationId: "deleteNote",
        security,
        params: RequestNoteItemParamsSchema,
        querystring: NoteLifecycleCommandSchema,
        response: {
          200: ResponseNoteFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.deleteNoteController.handle,
  );

  app.post(
    "/campaigns/:campaignId/notes/:noteId/restore",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.restore },
      },
      schema: {
        tags,
        operationId: "restoreNote",
        security,
        params: RequestNoteItemParamsSchema,
        body: NoteLifecycleCommandSchema,
        response: {
          200: ResponseNoteFullSchema,
          ...writeErrorResponses,
        },
      },
    },
    controllers.restoreNoteController.handle,
  );

  app.get(
    "/campaigns/:campaignId/notes/:noteId/usages",
    {
      config: {
        permission: { key: NOTES_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true },
      },
      schema: {
        tags,
        operationId: "getNoteUsages",
        security,
        params: RequestNoteItemParamsSchema,
        response: {
          200: ResponseAssetUsagesSchema,
          400: errorResponseDto,
          ...readErrorResponses,
        },
      },
    },
    controllers.getNoteUsagesController.handle,
  );
}
