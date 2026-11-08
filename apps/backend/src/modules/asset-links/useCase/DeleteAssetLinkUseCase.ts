import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { ASSET_LINK_ACTIONS } from "#src/modules/asset-links/history/TrackedAssetLink";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import type { AssetsService } from "#src/modules/assets/index";

export type DeleteAssetLinkInput = {
  campaignId: string;
  assetId: string;
  linkId: string;
};

/** Removes the link only; both assets stay untouched. */
export class DeleteAssetLinkUseCase extends MutationUseCase<DeleteAssetLinkInput, void> {
  protected readonly action = ASSET_LINK_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly linksService: AssetLinksService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteAssetLinkInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteAssetLinkInput,
  ): Promise<void> {
    await this.linksService.removeLink(scope, {
      campaignId: input.campaignId,
      sourceAssetId: input.assetId,
      linkId: input.linkId,
    });
  }
}
