import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseMediaUploadDto,
  toMediaUploadResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import { MediaUploadService } from "#src/modules/media/service/MediaUploadService";

/** Tells a client that lost its connection which parts it still has to send. */
export class GetMediaUploadUseCase {
  constructor(
    private readonly uploadService: MediaUploadService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; uploadId: string },
  ): Promise<ResponseMediaUploadDto> {
    await this.assetsService.assertCanEditCampaignContent(
      context,
      input.campaignId,
      this.uploadService.db,
    );

    const upload = await this.uploadService.require({
      ...input,
      actorId: this.assetsService.assertAuthenticated(context),
    });

    return toMediaUploadResponse(upload, await this.uploadService.listUploadedParts(upload));
  }
}
