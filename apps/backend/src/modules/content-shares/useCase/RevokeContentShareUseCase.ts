import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

export type RevokeContentShareInput = { campaignId: string; shareId: string };

/** Shares are no content, so this runs in a plain transaction without history. */
export class RevokeContentShareUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(context: RequestContext, input: RevokeContentShareInput): Promise<void> {
    this.assetsService.assertAuthenticated(context);

    // Checked first, so nobody outside the campaign triggers the cleanup.
    await this.assetsService.assertCanEditCampaignContent(
      context,
      input.campaignId,
      this.sharesService.db,
    );
    await this.sharesService.deleteExpired(input.campaignId);

    return this.sharesService.transactionManager.inTransaction(async (tx) => {
      await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, tx);

      await this.sharesService.revokeShare(tx, input);
    });
  }
}
