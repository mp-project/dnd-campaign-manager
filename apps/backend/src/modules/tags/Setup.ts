import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import { TagsRepository } from "#src/modules/tags/domain/repository/TagsRepository";
import { CreateTagController } from "#src/modules/tags/http/controller/CreateTagController";
import { DeleteTagController } from "#src/modules/tags/http/controller/DeleteTagController";
import { ListAssetTagsController } from "#src/modules/tags/http/controller/ListAssetTagsController";
import { ListTagsController } from "#src/modules/tags/http/controller/ListTagsController";
import { ReplaceAssetTagsController } from "#src/modules/tags/http/controller/ReplaceAssetTagsController";
import { UpdateTagController } from "#src/modules/tags/http/controller/UpdateTagController";
import { registerTagsRoutes } from "#src/modules/tags/http/routes/v1/TagsRoutes";
import { tagsPermissionDefinitions } from "#src/modules/tags/permissions/TagsPermissions";
import { TagsService } from "#src/modules/tags/service/TagsService";
import { CreateTagUseCase } from "#src/modules/tags/useCase/CreateTagUseCase";
import { DeleteTagUseCase } from "#src/modules/tags/useCase/DeleteTagUseCase";
import { ListAssetTagsUseCase } from "#src/modules/tags/useCase/ListAssetTagsUseCase";
import { ListTagsUseCase } from "#src/modules/tags/useCase/ListTagsUseCase";
import { ReplaceAssetTagsUseCase } from "#src/modules/tags/useCase/ReplaceAssetTagsUseCase";
import { UpdateTagUseCase } from "#src/modules/tags/useCase/UpdateTagUseCase";

export const TAGS_MODULE_DEPENDENCIES = "tags.module.dependencies";

/**
 * Public port of the tags module. Domain modules use `service` (`assign`, `replaceAssignments`,
 * `getUsageCount`) inside their own actions; `repository.listForAsset` reads the tags of an asset.
 */
export type TagsModuleDependencies = {
  service: TagsService;
};

async function registerTagsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions("tags", tagsPermissionDefinitions);

  const assetsDependencies = container.dependencies.get<AssetsModuleDependencies>(
    ASSETS_MODULE_DEPENDENCIES,
  );

  if (!assetsDependencies) {
    throw new Error("Assets module dependencies are missing");
  }

  const campaignsDependencies = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );

  if (!campaignsDependencies) {
    throw new Error("Campaigns module dependencies are missing");
  }

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assetsDependencies.service;
  const service = new TagsService(
    container.db,
    container.transactionManager,
    new TagsRepository(),
    assetsService,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaignsDependencies.service.findCampaignRole(campaignId, actorId, db),
    },
  );

  history.register(service.trackedTag);

  container.dependencies.set<TagsModuleDependencies>(TAGS_MODULE_DEPENDENCIES, { service });

  app.register(async (tagsApp) => {
    registerTagsRoutes(tagsApp, {
      listTagsController: new ListTagsController(new ListTagsUseCase(service, assetsService)),
      createTagController: new CreateTagController(
        new CreateTagUseCase(history, service, assetsService),
      ),
      updateTagController: new UpdateTagController(
        new UpdateTagUseCase(history, service, assetsService),
      ),
      deleteTagController: new DeleteTagController(
        new DeleteTagUseCase(history, service, assetsService),
      ),
      listAssetTagsController: new ListAssetTagsController(
        new ListAssetTagsUseCase(service, assetsService),
      ),
      replaceAssetTagsController: new ReplaceAssetTagsController(
        new ReplaceAssetTagsUseCase(history, service, assetsService),
      ),
    });
  });
}

export const tagsModule: AppModule = {
  name: "tags",
  dependencies: ["system", "auth", "history", "campaigns", "assets"],
  register: registerTagsModule,
};
