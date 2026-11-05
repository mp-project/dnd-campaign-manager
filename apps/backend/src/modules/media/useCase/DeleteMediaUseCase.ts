import { ForbiddenError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResponseMediaRemovedDto } from "#src/modules/media/domain/dto/ResponseMediaDto";
import type { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
import { MediaService } from "#src/modules/media/service/MediaService";

/** Not an action of the history: files have none, and the object is removed after the commit. */
export class DeleteMediaUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
    private readonly quota: MediaQuotaService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; mediaId: string },
  ): Promise<ResponseMediaRemovedDto> {
    const { db } = this.mediaService;

    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    const file = await this.mediaService.requireFileInCampaign(input.campaignId, input.mediaId);

    if (file.scope === "SYSTEM" && !isSysAdminRole(context.systemRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    await this.mediaService.deleteIfUnused({
      ...input,
      actorId: this.assetsService.assertAuthenticated(context),
    });

    return {
      storageUsage: await this.quota.findVisibleUsage(context, input.campaignId),
    };
  }
}
