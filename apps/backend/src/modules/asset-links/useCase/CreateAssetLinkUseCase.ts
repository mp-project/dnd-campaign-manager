import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateAssetLinkDto } from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
import {
  type ResponseAssetLinkFullDto,
  toAssetLinkFullResponse,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import { ASSET_LINK_ACTIONS } from "#src/modules/asset-links/history/TrackedAssetLink";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import type { AssetsService } from "#src/modules/assets/index";

export type CreateAssetLinkInput = {
  campaignId: string;
  assetId: string;
  command: CreateAssetLinkDto;
};

export class CreateAssetLinkUseCase extends MutationUseCase<
  CreateAssetLinkInput,
  ResponseAssetLinkFullDto
> {
  protected readonly action = ASSET_LINK_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly linksService: AssetLinksService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateAssetLinkInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateAssetLinkInput,
  ): Promise<ResponseAssetLinkFullDto> {
    const { link, target } = await this.linksService.createLink(
      scope,
      {
        actorId: this.assetsService.assertAuthenticated(context),
        campaignId: input.campaignId,
        sourceAssetId: input.assetId,
      },
      input.command,
    );

    return toAssetLinkFullResponse(link, "outgoing", target);
  }
}
