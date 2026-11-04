import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { UpdateAssetMetadataDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import {
  type ResponseUpdateAssetDto,
  toUpdateAssetResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { ASSET_ACTIONS } from "#src/modules/assets/history/TrackedAsset";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export type UpdateAssetInput = {
  assetId: string;
  command: UpdateAssetMetadataDto;
};

export class UpdateAssetUseCase extends MutationUseCase<UpdateAssetInput, ResponseUpdateAssetDto> {
  protected readonly action = ASSET_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext): Promise<Authorization> {
    this.assetsService.assertCanManage(context);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateAssetInput,
  ): Promise<ResponseUpdateAssetDto> {
    const { expectedVersion, ...patch } = input.command;

    return toUpdateAssetResponse(
      await this.assetsService.updateMetadata(scope, {
        actorId: this.assetsService.assertAuthenticated(context),
        assetId: input.assetId,
        expectedVersion,
        patch,
      }),
    );
  }
}
