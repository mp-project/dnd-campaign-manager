import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { parseMimeAllowlist } from "#core/storage/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
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
import { registerMediaRoutes } from "#src/modules/media/http/routes/v1/MediaRoutes";
import { mediaPermissionDefinitions } from "#src/modules/media/permissions/MediaPermissions";
import { MediaCleanupService } from "#src/modules/media/service/MediaCleanupService";
import { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
import { MediaService } from "#src/modules/media/service/MediaService";
import { MediaUploadService } from "#src/modules/media/service/MediaUploadService";
import { AbortMediaUploadUseCase } from "#src/modules/media/useCase/AbortMediaUploadUseCase";
import { AttachMediaUseCase } from "#src/modules/media/useCase/AttachMediaUseCase";
import { CompleteMediaUploadUseCase } from "#src/modules/media/useCase/CompleteMediaUploadUseCase";
import { CreateMediaUploadUseCase } from "#src/modules/media/useCase/CreateMediaUploadUseCase";
import { DeleteMediaUseCase } from "#src/modules/media/useCase/DeleteMediaUseCase";
import { DetachMediaUseCase } from "#src/modules/media/useCase/DetachMediaUseCase";
import { GetMediaContentUseCase } from "#src/modules/media/useCase/GetMediaContentUseCase";
import { GetMediaUseCase } from "#src/modules/media/useCase/GetMediaUseCase";
import { GetMediaUploadUseCase } from "#src/modules/media/useCase/GetMediaUploadUseCase";
import { ListAssetMediaUseCase } from "#src/modules/media/useCase/ListAssetMediaUseCase";
import { ListMediaUseCase } from "#src/modules/media/useCase/ListMediaUseCase";
import { UpdateAssetMediaUseCase } from "#src/modules/media/useCase/UpdateAssetMediaUseCase";
import { UploadMediaPartUseCase } from "#src/modules/media/useCase/UploadMediaPartUseCase";

export const MEDIA_MODULE_DEPENDENCIES = "media.module.dependencies";

/**
 * Public port of the media module. Domain modules use `service` (`attach`, `updateAssignment`,
 * `detach`) inside their own actions. `quota` lets a module replace the limits per campaign.
 */
export type MediaModuleDependencies = {
  service: MediaService;
  quota: MediaQuotaService;
};

async function registerMediaModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions("media", mediaPermissionDefinitions);

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

  const storage = container.ports.storagePort;

  if (!storage) {
    throw new Error("Storage port is missing");
  }

  const assetsService = assetsDependencies.service;
  const repository = new MediaRepository();
  const service = new MediaService(
    container.db,
    container.transactionManager,
    repository,
    storage,
    assetsService,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaignsDependencies.service.findCampaignRole(campaignId, actorId, db),
    },
    new MediaCleanupService(container.db, repository, storage, app.log),
    { downloadUrlTtlSeconds: container.config.STORAGE_DOWNLOAD_URL_TTL_SECONDS },
  );
  const quota = new MediaQuotaService(container.db, repository, storage);
  const uploadService = new MediaUploadService(
    container.db,
    container.transactionManager,
    repository,
    storage,
    quota,
    { allowedMimeTypes: parseMimeAllowlist(container.config.STORAGE_ALLOWED_MIME_TYPES) },
  );

  history.register(service.trackedAssignment);

  container.dependencies.set<MediaModuleDependencies>(MEDIA_MODULE_DEPENDENCIES, {
    service,
    quota,
  });

  app.register(async (mediaApp) => {
    // Parts go straight to the storage, unread and not limited by the body limit: the use case
    // checks their size against what the upload announced.
    mediaApp.addContentTypeParser("application/octet-stream", (_request, payload, done) => {
      done(null, payload);
    });

    registerMediaRoutes(mediaApp, {
      listMediaController: new ListMediaController(new ListMediaUseCase(service, assetsService, quota)),
      createMediaUploadController: new CreateMediaUploadController(
        new CreateMediaUploadUseCase(uploadService, assetsService, quota),
      ),
      getMediaUploadController: new GetMediaUploadController(
        new GetMediaUploadUseCase(uploadService, assetsService),
      ),
      uploadMediaPartController: new UploadMediaPartController(
        new UploadMediaPartUseCase(uploadService, assetsService),
      ),
      completeMediaUploadController: new CompleteMediaUploadController(
        new CompleteMediaUploadUseCase(uploadService, assetsService, quota),
      ),
      abortMediaUploadController: new AbortMediaUploadController(
        new AbortMediaUploadUseCase(uploadService, assetsService, quota),
      ),
      getMediaController: new GetMediaController(new GetMediaUseCase(service, assetsService)),
      getMediaContentController: new GetMediaContentController(
        new GetMediaContentUseCase(service, assetsService),
      ),
      deleteMediaController: new DeleteMediaController(
        new DeleteMediaUseCase(service, assetsService, quota),
      ),
      listAssetMediaController: new ListAssetMediaController(
        new ListAssetMediaUseCase(service, assetsService),
      ),
      attachMediaController: new AttachMediaController(
        new AttachMediaUseCase(history, service, assetsService),
      ),
      updateAssetMediaController: new UpdateAssetMediaController(
        new UpdateAssetMediaUseCase(history, service, assetsService),
      ),
      detachMediaController: new DetachMediaController(
        new DetachMediaUseCase(history, service, assetsService),
      ),
    });
  });
}

export const mediaModule: AppModule = {
  name: "media",
  dependencies: ["system", "auth", "history", "campaigns", "assets"],
  register: registerMediaModule,
};
