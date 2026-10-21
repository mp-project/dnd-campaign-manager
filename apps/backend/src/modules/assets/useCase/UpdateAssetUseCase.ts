import type { RequestContext } from "#core/http/requestContext";
import type { UpdateAssetMetadataDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import {
  type ResponseAssetGmDto,
  toAssetGmResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class UpdateAssetUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    assetId: string,
    input: UpdateAssetMetadataDto,
  ): Promise<ResponseAssetGmDto> {
    const actorId = this.assetsService.assertAuthenticated(context);
    const { expectedVersion, ...patch } = input;

    const record = await this.assetsService.transactionManager.inTransaction((tx) =>
      this.assetsService.updateMetadata(tx, { actorId, assetId, expectedVersion, patch }),
    );

    return toAssetGmResponse(record);
  }
}
