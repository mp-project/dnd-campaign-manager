import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import type { AssetsService } from "#src/modules/assets/index";
import type { CreateMediaUploadDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import {
  type ResponseCreateMediaUploadDto,
  toMediaUploadResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import type { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
import { MediaUploadService } from "#src/modules/media/service/MediaUploadService";

export class CreateMediaUploadUseCase {
  constructor(
    private readonly uploadService: MediaUploadService,
    private readonly assetsService: AssetsService,
    private readonly quota: MediaQuotaService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; command: CreateMediaUploadDto },
  ): Promise<ResponseCreateMediaUploadDto> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId,
      this.uploadService.db,
    );

    const upload = await this.uploadService.create({
      campaignId: input.campaignId,
      actorId: this.assetsService.assertAuthenticated(context),
      systemRole: context.systemRole,
      input: input.command,
    });

    recordChange({
      action: "media.createUpload",
      entities: [
        {
          entityType: "mediaUpload",
          entityId: upload.id,
          values: {
            originalName: upload.originalName,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
          },
        },
      ],
      campaignId: input.campaignId,
      actorId: upload.createdBy,
    });

    return {
      ...toMediaUploadResponse(upload, []),
      storageUsage: await this.quota.findVisibleUsage(context, input.campaignId),
    };
  }
}
