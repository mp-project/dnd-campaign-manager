import type { Readable } from "node:stream";

import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResponseMediaUploadPartDto } from "#src/modules/media/domain/dto/ResponseMediaDto";
import { MediaUploadService } from "#src/modules/media/service/MediaUploadService";

export class UploadMediaPartUseCase {
  constructor(
    private readonly uploadService: MediaUploadService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: {
      campaignId: string;
      uploadId: string;
      partNumber: number;
      contentLength: number | null;
      stream: Readable;
    },
  ): Promise<ResponseMediaUploadPartDto> {
    await this.assetsService.assertCanEditCampaignContent(
      context,
      input.campaignId,
      this.uploadService.db,
    );

    const upload = await this.uploadService.require({
      campaignId: input.campaignId,
      uploadId: input.uploadId,
      actorId: this.assetsService.assertAuthenticated(context),
    });

    return this.uploadService.uploadPart({
      upload,
      partNumber: input.partNumber,
      contentLength: input.contentLength,
      stream: input.stream,
    });
  }
}
