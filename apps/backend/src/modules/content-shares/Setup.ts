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
  CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES,
  type CampaignMembershipsModuleDependencies,
} from "#src/modules/campaign-memberships/index";
import { ContentSharesRepository } from "#src/modules/content-shares/domain/repository/ContentSharesRepository";
import { CreateContentShareController } from "#src/modules/content-shares/http/controller/CreateContentShareController";
import { GetContentShareController } from "#src/modules/content-shares/http/controller/GetContentShareController";
import { GetSharedContentController } from "#src/modules/content-shares/http/controller/GetSharedContentController";
import { ListContentSharesController } from "#src/modules/content-shares/http/controller/ListContentSharesController";
import { RevokeContentShareController } from "#src/modules/content-shares/http/controller/RevokeContentShareController";
import { UpdateContentShareController } from "#src/modules/content-shares/http/controller/UpdateContentShareController";
import { registerContentSharesRoutes } from "#src/modules/content-shares/http/routes/v1/ContentSharesRoutes";
import { contentSharesPermissionDefinitions } from "#src/modules/content-shares/permissions/ContentSharesPermissions";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";
import { CreateContentShareUseCase } from "#src/modules/content-shares/useCase/CreateContentShareUseCase";
import { GetContentShareUseCase } from "#src/modules/content-shares/useCase/GetContentShareUseCase";
import { GetSharedContentUseCase } from "#src/modules/content-shares/useCase/GetSharedContentUseCase";
import { ListContentSharesUseCase } from "#src/modules/content-shares/useCase/ListContentSharesUseCase";
import { RevokeContentShareUseCase } from "#src/modules/content-shares/useCase/RevokeContentShareUseCase";
import { UpdateContentShareUseCase } from "#src/modules/content-shares/useCase/UpdateContentShareUseCase";

export const CONTENT_SHARES_MODULE_DEPENDENCIES = "content-shares.module.dependencies";

/**
 * Public port of the content-shares module. Content types of `kind: "STORY"` (registered with
 * `AssetsService.registerContentType`, with their player view) can be shared; nothing else.
 */
export type ContentSharesModuleDependencies = {
  service: ContentSharesService;
};

async function registerContentSharesModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "content-shares",
    contentSharesPermissionDefinitions,
  );

  const assetsDependencies = container.dependencies.get<AssetsModuleDependencies>(
    ASSETS_MODULE_DEPENDENCIES,
  );

  if (!assetsDependencies) {
    throw new Error("Assets module dependencies are missing");
  }

  const assetLinksDependencies = container.dependencies.get<AssetLinksModuleDependencies>(
    ASSET_LINKS_MODULE_DEPENDENCIES,
  );

  if (!assetLinksDependencies) {
    throw new Error("Asset links module dependencies are missing");
  }

  const membershipsDependencies = container.dependencies.get<CampaignMembershipsModuleDependencies>(
    CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES,
  );

  if (!membershipsDependencies) {
    throw new Error("Campaign memberships module dependencies are missing");
  }

  const assetsService = assetsDependencies.service;
  const membershipsRepository = membershipsDependencies.repository;
  const service = new ContentSharesService(
    container.db,
    container.transactionManager,
    new ContentSharesRepository(),
    assetsService,
    {
      findById: (db, campaignId, membershipId) =>
        membershipsRepository.findById(db, campaignId, membershipId),
      findActiveByUser: (db, campaignId, userId) =>
        membershipsRepository.findActiveByUser(db, campaignId, userId),
      listActiveByCampaign: (db, campaignId) =>
        membershipsRepository.listActiveByCampaign(db, campaignId),
    },
  );

  assetsService.registerVisibilityProvider({
    name: "content-shares",
    listVisibleAssetIds: (input, db) => service.listVisibleAssetIds(input, db),
  });

  // Content that leaves ACTIVE (draft or archive, on every path) ends its shares for good.
  assetsService.registerDeactivateHook({
    name: "content-shares",
    onDeactivate: async (asset, db) => {
      if (service.isShareable(asset.assetType)) {
        await service.endSharesOfAsset(db, asset.id);
      }
    },
  });

  // A share does not block archiving: an archived asset is hidden from players anyway.
  assetLinksDependencies.service.registerUsageProvider({
    name: "content-shares",
    group: "shares",
    listUsages: (input, db) => service.listUsages(input, db),
    listUsagesForPlayer: (input, db) => service.listUsages(input, db),
  });

  container.dependencies.set<ContentSharesModuleDependencies>(
    CONTENT_SHARES_MODULE_DEPENDENCIES,
    { service },
  );

  app.register(async (sharesApp) => {
    registerContentSharesRoutes(sharesApp, {
      listContentSharesController: new ListContentSharesController(
        new ListContentSharesUseCase(service, assetsService),
      ),
      getContentShareController: new GetContentShareController(
        new GetContentShareUseCase(service, assetsService),
      ),
      getSharedContentController: new GetSharedContentController(
        new GetSharedContentUseCase(service, assetsService),
      ),
      createContentShareController: new CreateContentShareController(
        new CreateContentShareUseCase(service, assetsService),
      ),
      updateContentShareController: new UpdateContentShareController(
        new UpdateContentShareUseCase(service, assetsService),
      ),
      revokeContentShareController: new RevokeContentShareController(
        new RevokeContentShareUseCase(service, assetsService),
      ),
    });
  });
}

export const contentSharesModule: AppModule = {
  name: "content-shares",
  dependencies: ["system", "auth", "campaigns", "campaign-memberships", "assets", "asset-links"],
  register: registerContentSharesModule,
};
