import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseCompleteMediaUploadDto,
  toMediaFullResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import type { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
import { MediaUploadService } from "#src/modules/media/service/MediaUploadService";

export class CompleteMediaUploadUseCase {
  constructor(
    private readonly uploadService: MediaUploadService,
    private readonly assetsService: AssetsService,
    private readonly quota: MediaQuotaService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; uploadId: string },
  ): Promise<ResponseCompleteMediaUploadDto> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId,
      this.uploadService.db,
    );

    const upload = await this.uploadService.require({
      ...input,
      actorId: this.assetsService.assertAuthenticated(context),
    });
    const file = await this.uploadService.complete(upload);

    return {
      ...toMediaFullResponse(file, input.campaignId, 0),
      storageUsage: await this.quota.findVisibleUsage(context, input.campaignId),
    };
  }
}
