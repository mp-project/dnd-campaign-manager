import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { UpdateAssetMediaDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import {
  type ResponseUpdateAssetMediaDto,
  toAssetMediaFullResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import type { MediaFileRow } from "#src/modules/media/domain/repository/MediaRepository";
import { ASSET_MEDIA_ACTIONS } from "#src/modules/media/history/TrackedAssetMedia";
import { MediaService } from "#src/modules/media/service/MediaService";

export type UpdateAssetMediaInput = {
  campaignId: string;
  assetId: string;
  assignmentId: string;
  command: UpdateAssetMediaDto;
};

export class UpdateAssetMediaUseCase extends MutationUseCase<
  UpdateAssetMediaInput,
  ResponseUpdateAssetMediaDto
> {
  protected readonly action = ASSET_MEDIA_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateAssetMediaInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: UpdateAssetMediaInput,
  ): Promise<ResponseUpdateAssetMediaDto> {
    const { row, merged } = await this.mediaService.updateAssignment(scope, input);
    const file = await this.mediaService.repository.findFileById(scope.tx, row.mediaId);

    return { ...toAssetMediaFullResponse(row, file as MediaFileRow), merged };
  }
}
