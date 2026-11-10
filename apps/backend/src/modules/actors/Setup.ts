import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { MEMBER_OF_RELATION } from "#src/modules/actors/domain/ActorRelations";
import {
  ResponseActorPlayerSchema,
  toActorPlayerResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import { ActorsRepository } from "#src/modules/actors/domain/repository/ActorsRepository";
import { ACTOR_ASSET_ACTIONS } from "#src/modules/actors/history/TrackedActor";
import { CreateActorController } from "#src/modules/actors/http/controller/CreateActorController";
import { DeleteActorController } from "#src/modules/actors/http/controller/DeleteActorController";
import { GetActorController } from "#src/modules/actors/http/controller/GetActorController";
import { GetActorStatBlockController } from "#src/modules/actors/http/controller/GetActorStatBlockController";
import { GetActorUsagesController } from "#src/modules/actors/http/controller/GetActorUsagesController";
import { ListActorsController } from "#src/modules/actors/http/controller/ListActorsController";
import { RestoreActorController } from "#src/modules/actors/http/controller/RestoreActorController";
import { UpdateActorController } from "#src/modules/actors/http/controller/UpdateActorController";
import { registerActorsRoutes } from "#src/modules/actors/http/routes/v1/ActorsRoutes";
import { actorsPermissionDefinitions } from "#src/modules/actors/permissions/ActorsPermissions";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import { CreateActorUseCase } from "#src/modules/actors/useCase/CreateActorUseCase";
import { DeleteActorUseCase } from "#src/modules/actors/useCase/DeleteActorUseCase";
import { GetActorStatBlockUseCase } from "#src/modules/actors/useCase/GetActorStatBlockUseCase";
import { GetActorUsagesUseCase } from "#src/modules/actors/useCase/GetActorUsagesUseCase";
import { GetActorUseCase } from "#src/modules/actors/useCase/GetActorUseCase";
import { ListActorsUseCase } from "#src/modules/actors/useCase/ListActorsUseCase";
import { RestoreActorUseCase } from "#src/modules/actors/useCase/RestoreActorUseCase";
import { UpdateActorUseCase } from "#src/modules/actors/useCase/UpdateActorUseCase";
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
import { ITEMS_MODULE_DEPENDENCIES, type ItemsModuleDependencies } from "#src/modules/items/index";
import { TAGS_MODULE_DEPENDENCIES, type TagsModuleDependencies } from "#src/modules/tags/index";

export const ACTORS_MODULE_DEPENDENCIES = "actors.module.dependencies";

/**
 * Public port of the actors module. The category modules (NPC, monster and player data, character
 * assignments, progression) add their blocks to an actor through `service`: `requireActor` and
 * `computeStatBlock`, in their own transaction (passing its handle as `db`).
 */
export type ActorsModuleDependencies = {
  service: ActorsService;
};

async function registerActorsModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("actors", actorsPermissionDefinitions);

  const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  const campaigns = container.dependencies.require<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES);
  const tags = container.dependencies.require<TagsModuleDependencies>(TAGS_MODULE_DEPENDENCIES);
  const assetLinks = container.dependencies.require<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES);
  const items = container.dependencies.require<ItemsModuleDependencies>(ITEMS_MODULE_DEPENDENCIES);
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new ActorsService(
    container.db,
    container.transactionManager,
    new ActorsRepository(),
    assetsService,
    tags.service,
    assetLinks.service,
    items.instances,
    {
      findCampaignRole: (campaignId, actorId, db) => campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
    },
  );

  history.register(service.trackedActor);
  // Actors reach players through content shares, as their player view. They use the items they
  // name (proficiencies, loot), so those stay readable while the actor is not archived.
  assetsService.registerContentType({
    assetType: "ACTOR",
    kind: "STORY",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: ACTOR_ASSET_ACTIONS,
    playerView: {
      schema: ResponseActorPlayerSchema,
      load: async (input, db) => toActorPlayerResponse(await service.loadPlayerContent(input, db)),
    },
    usesContent: true,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });
  assetLinks.service.relations.register(MEMBER_OF_RELATION);

  container.dependencies.set<ActorsModuleDependencies>(ACTORS_MODULE_DEPENDENCIES, { service });

  app.register(async (actorsApp) => {
    registerActorsRoutes(actorsApp, {
      listActorsController: new ListActorsController(
        new ListActorsUseCase(service, assetsService, tags.service),
      ),
      getActorController: new GetActorController(new GetActorUseCase(service, assetsService)),
      getActorStatBlockController: new GetActorStatBlockController(
        new GetActorStatBlockUseCase(service, assetsService),
      ),
      getActorUsagesController: new GetActorUsagesController(
        new GetActorUsagesUseCase(service, assetsService, assetLinks.service),
      ),
      createActorController: new CreateActorController(
        new CreateActorUseCase(history, service, assetsService),
      ),
      updateActorController: new UpdateActorController(
        new UpdateActorUseCase(history, service, assetsService),
      ),
      deleteActorController: new DeleteActorController(
        new DeleteActorUseCase(history, service, assetsService),
      ),
      restoreActorController: new RestoreActorController(
        new RestoreActorUseCase(history, service, assetsService),
      ),
    });
  });
}

export const actorsModule: AppModule = {
  name: "actors",
  dependencies: [
    "system",
    "auth",
    "history",
    "campaigns",
    "assets",
    "asset-links",
    "tags",
    "items",
  ],
  register: registerActorsModule,
};
