import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { AttachMediaDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import {
  type ResponseAssetMediaFullDto,
  toAssetMediaFullResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import { ASSET_MEDIA_ACTIONS } from "#src/modules/media/history/TrackedAssetMedia";
import { MediaService } from "#src/modules/media/service/MediaService";

export type AttachMediaInput = {
  campaignId: string;
  assetId: string;
  command: AttachMediaDto;
};

export class AttachMediaUseCase extends MutationUseCase<AttachMediaInput, ResponseAssetMediaFullDto> {
  protected readonly action = ASSET_MEDIA_ACTIONS.attach;

  constructor(
    history: HistoryPort,
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: AttachMediaInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: AttachMediaInput,
  ): Promise<ResponseAssetMediaFullDto> {
    const { assignment, file } = await this.mediaService.attach(
      scope,
      { campaignId: input.campaignId, assetId: input.assetId },
      input.command,
    );

    return toAssetMediaFullResponse(assignment, file);
  }
}
