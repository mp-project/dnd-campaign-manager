import type { RequestContext } from "#core/http/requestContext";
import type { AssetLifecycleCommandDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import {
  type ResponseAssetGmDto,
  toAssetGmResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class RestoreAssetUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    assetId: string,
    input: AssetLifecycleCommandDto,
  ): Promise<ResponseAssetGmDto> {
    const actorId = this.assetsService.assertAuthenticated(context);

    const record = await this.assetsService.transactionManager.inTransaction((tx) =>
      this.assetsService.restoreBase(tx, {
        actorId,
        assetId,
        expectedVersion: input.expectedVersion,
      }),
    );

    return toAssetGmResponse(record);
  }
}
