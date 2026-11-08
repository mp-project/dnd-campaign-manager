import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateAssetLinkDto,
  toUpdateAssetLinkResponse,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import type { UpdateAssetLinkDto } from "#src/modules/asset-links/domain/dto/UpdateAssetLinkDto";
import { ASSET_LINK_ACTIONS } from "#src/modules/asset-links/history/TrackedAssetLink";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import type { AssetsService } from "#src/modules/assets/index";

export type UpdateAssetLinkInput = {
  campaignId: string;
  assetId: string;
  linkId: string;
  command: UpdateAssetLinkDto;
};

export class UpdateAssetLinkUseCase extends MutationUseCase<
  UpdateAssetLinkInput,
  ResponseUpdateAssetLinkDto
> {
  protected readonly action = ASSET_LINK_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly linksService: AssetLinksService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateAssetLinkInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: UpdateAssetLinkInput,
  ): Promise<ResponseUpdateAssetLinkDto> {
    const { row, merged } = await this.linksService.updateLink(scope, {
      campaignId: input.campaignId,
      sourceAssetId: input.assetId,
      linkId: input.linkId,
      command: input.command,
    });
    const target = await this.assetsService.requireAsset(scope.tx, row.targetAssetId);

    return toUpdateAssetLinkResponse(row, target, merged);
  }
}
