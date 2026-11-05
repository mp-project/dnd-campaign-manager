import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import { ASSET_MEDIA_ACTIONS } from "#src/modules/media/history/TrackedAssetMedia";
import { MediaService } from "#src/modules/media/service/MediaService";

export type DetachMediaInput = { campaignId: string; assetId: string; assignmentId: string };

export class DetachMediaUseCase extends MutationUseCase<DetachMediaInput, void> {
  protected readonly action = ASSET_MEDIA_ACTIONS.detach;

  constructor(
    history: HistoryPort,
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DetachMediaInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DetachMediaInput,
  ): Promise<void> {
    await this.mediaService.detach(scope, input);
  }
}
