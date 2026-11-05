import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { CreateContentShareDto } from "#src/modules/content-shares/domain/dto/CreateContentShareDto";
import {
  type ResponseContentShareGmDto,
  toContentShareGmResponse,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

export type CreateContentShareInput = { campaignId: string; command: CreateContentShareDto };

/** Shares are no content, so this runs in a plain transaction without history. */
export class CreateContentShareUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(context: RequestContext, input: CreateContentShareInput): Promise<ResponseContentShareGmDto> {
    const actorId = this.assetsService.assertAuthenticated(context);

    // Checked first, so nobody outside the campaign triggers the cleanup.
    await this.assetsService.assertCanEditCampaignContent(
      context,
      input.campaignId,
      this.sharesService.db,
    );
    await this.sharesService.deleteExpired(input.campaignId);

    const { rulesetId } = await this.assetsService.resolveCampaignViewer(context, input.campaignId);

    return this.sharesService.transactionManager.inTransaction(async (tx) => {
      await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, tx);

      const share = await this.sharesService.createShare(
        tx,
        { actorId, campaignId: input.campaignId, rulesetId },
        input.command,
      );
      const recipients = await this.sharesService.listActiveRecipients(
        input.campaignId,
        [share.id],
        tx,
      );
      const asset = await this.assetsService.requireAsset(tx, share.assetId);

      return toContentShareGmResponse(share, recipients.get(share.id) ?? [], asset);
    });
  }
}
