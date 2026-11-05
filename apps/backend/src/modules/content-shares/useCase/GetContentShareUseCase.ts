import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseContentShareDto,
  toContentShareGmResponse,
  toContentSharePlayerResponse,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

export class GetContentShareUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; shareId: string },
  ): Promise<ResponseContentShareDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);

    if (viewer.view === "PLAYER") {
      const received = (await this.sharesService.listReceived(viewer)).find(
        ({ share }) => share.id === input.shareId,
      );
      const asset = received
        ? (await this.sharesService.findVisibleAsset(viewer, [received.share.assetId])).get(
            received.share.assetId,
          )
        : undefined;

      if (!received || !asset) {
        throw new NotFoundError("Share not found");
      }

      return toContentSharePlayerResponse(received.share, received.revealedAt, asset);
    }

    const share = await this.sharesService.requireShare(this.sharesService.db, input);
    const recipients = await this.sharesService.listActiveRecipients(viewer.campaignId, [share.id]);
    const asset = await this.assetsService.requireAsset(this.sharesService.db, share.assetId);

    return toContentShareGmResponse(share, recipients.get(share.id) ?? [], asset);
  }
}
