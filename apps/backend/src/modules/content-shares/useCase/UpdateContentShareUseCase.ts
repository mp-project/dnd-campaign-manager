import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseContentShareFullDto,
  toContentShareFullResponse,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import type { UpdateContentShareDto } from "#src/modules/content-shares/domain/dto/UpdateContentShareDto";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

export type UpdateContentShareInput = { campaignId: string; shareId: string; command: UpdateContentShareDto };

/** Shares are no content, so this runs in a plain transaction without history. */
export class UpdateContentShareUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(context: RequestContext, input: UpdateContentShareInput): Promise<ResponseContentShareFullDto> {
    const actorId = this.assetsService.assertAuthenticated(context);

    // Checked first, so nobody outside the campaign triggers the cleanup.
    await this.assetsService.assertCanEditCampaignContent(
      context,
      input.campaignId,
      this.sharesService.db,
    );
    await this.sharesService.deleteExpired(input.campaignId);

    return this.sharesService.transactionManager.inTransaction(async (tx) => {
      await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, tx);

      const share = await this.sharesService.updateShare(tx, { ...input, actorId });
      const recipients = await this.sharesService.listActiveRecipients(
        input.campaignId,
        [share.id],
        tx,
      );
      const asset = await this.assetsService.requireAsset(tx, share.assetId);

      return toContentShareFullResponse(share, recipients.get(share.id) ?? [], asset);
    });
  }
}
