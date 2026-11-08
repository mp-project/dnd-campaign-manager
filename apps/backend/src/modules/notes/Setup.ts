import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/index";
import {
  ResponseNotePlayerSchema,
  toNotePlayerResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NotesRepository } from "#src/modules/notes/domain/repository/NotesRepository";
import { NOTE_ASSET_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import { CreateNoteController } from "#src/modules/notes/http/controller/CreateNoteController";
import { DeleteNoteController } from "#src/modules/notes/http/controller/DeleteNoteController";
import { GetNoteController } from "#src/modules/notes/http/controller/GetNoteController";
import { GetNoteUsagesController } from "#src/modules/notes/http/controller/GetNoteUsagesController";
import { ListNotesController } from "#src/modules/notes/http/controller/ListNotesController";
import { RestoreNoteController } from "#src/modules/notes/http/controller/RestoreNoteController";
import { UpdateNoteController } from "#src/modules/notes/http/controller/UpdateNoteController";
import { registerNotesRoutes } from "#src/modules/notes/http/routes/v1/NotesRoutes";
import { notesPermissionDefinitions } from "#src/modules/notes/permissions/NotesPermissions";
import { NotesService } from "#src/modules/notes/service/NotesService";
import { CreateNoteUseCase } from "#src/modules/notes/useCase/CreateNoteUseCase";
import { DeleteNoteUseCase } from "#src/modules/notes/useCase/DeleteNoteUseCase";
import { GetNoteUseCase } from "#src/modules/notes/useCase/GetNoteUseCase";
import { GetNoteUsagesUseCase } from "#src/modules/notes/useCase/GetNoteUsagesUseCase";
import { ListNotesUseCase } from "#src/modules/notes/useCase/ListNotesUseCase";
import { RestoreNoteUseCase } from "#src/modules/notes/useCase/RestoreNoteUseCase";
import { UpdateNoteUseCase } from "#src/modules/notes/useCase/UpdateNoteUseCase";
import { TAGS_MODULE_DEPENDENCIES, type TagsModuleDependencies } from "#src/modules/tags/index";

export const NOTES_MODULE_DEPENDENCIES = "notes.module.dependencies";

/** Public port of the notes module; other modules read notes through `service`. */
export type NotesModuleDependencies = {
  service: NotesService;
};

async function registerNotesModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("notes", notesPermissionDefinitions);

  const assets = container.dependencies.get<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);

  if (!assets) {
    throw new Error("Assets module dependencies are missing");
  }

  const campaigns = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );

  if (!campaigns) {
    throw new Error("Campaigns module dependencies are missing");
  }

  const tags = container.dependencies.get<TagsModuleDependencies>(TAGS_MODULE_DEPENDENCIES);

  if (!tags) {
    throw new Error("Tags module dependencies are missing");
  }

  const assetLinks = container.dependencies.get<AssetLinksModuleDependencies>(
    ASSET_LINKS_MODULE_DEPENDENCIES,
  );

  if (!assetLinks) {
    throw new Error("Asset links module dependencies are missing");
  }

  const contentShares = container.dependencies.get<ContentSharesModuleDependencies>(
    CONTENT_SHARES_MODULE_DEPENDENCIES,
  );

  if (!contentShares) {
    throw new Error("Content shares module dependencies are missing");
  }

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new NotesService(
    container.db,
    container.transactionManager,
    new NotesRepository(),
    assetsService,
    tags.service,
    assetLinks.service,
    contentShares.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
    },
  );

  history.register(service.trackedNote);
  assetsService.allowCampaignRevert(NOTE_ASSET_ACTIONS);
  assetsService.registerDeactivateHook({
    name: "notes",
    onDeactivate: (asset, db) => service.endSharesOfHiddenNote(asset, db),
  });
  assetLinks.service.registerEditRoute("NOTE", (input, db) => service.findEditRoutes(input, db));
  contentShares.service.registerShareableType({
    assetType: "NOTE",
    playerContentSchema: ResponseNotePlayerSchema,
    loadPlayerContent: async (input, db) =>
      toNotePlayerResponse(await service.loadPlayerContent(input, db)),
  });

  container.dependencies.set<NotesModuleDependencies>(NOTES_MODULE_DEPENDENCIES, { service });

  app.register(async (notesApp) => {
    registerNotesRoutes(notesApp, {
      listNotesController: new ListNotesController(
        new ListNotesUseCase(service, assetsService, tags.service),
      ),
      getNoteController: new GetNoteController(new GetNoteUseCase(service, assetsService)),
      getNoteUsagesController: new GetNoteUsagesController(
        new GetNoteUsagesUseCase(service, assetsService, assetLinks.service),
      ),
      createNoteController: new CreateNoteController(
        new CreateNoteUseCase(history, service, assetsService),
      ),
      updateNoteController: new UpdateNoteController(
        new UpdateNoteUseCase(history, service, assetsService),
      ),
      deleteNoteController: new DeleteNoteController(
        new DeleteNoteUseCase(history, service, assetsService),
      ),
      restoreNoteController: new RestoreNoteController(
        new RestoreNoteUseCase(history, service, assetsService),
      ),
    });
  });
}

export const notesModule: AppModule = {
  name: "notes",
  dependencies: [
    "system",
    "auth",
    "history",
    "campaigns",
    "assets",
    "asset-links",
    "tags",
    "content-shares",
  ],
  register: registerNotesModule,
};
