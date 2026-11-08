import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetLifecycleCommandDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import {
  type ResponseAssetFullDto,
  toAssetFullResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { ASSET_ACTIONS } from "#src/modules/assets/history/TrackedAsset";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export type RestoreAssetInput = {
  assetId: string;
  command: AssetLifecycleCommandDto;
};

export class RestoreAssetUseCase extends MutationUseCase<RestoreAssetInput, ResponseAssetFullDto> {
  protected readonly action = ASSET_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreAssetInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanChangeLifecycle(context, input.assetId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreAssetInput,
  ): Promise<ResponseAssetFullDto> {
    return toAssetFullResponse(
      await this.assetsService.restoreBase(scope, {
        assetId: input.assetId,
        expectedVersion: input.command.expectedVersion,
      }),
    );
  }
}
