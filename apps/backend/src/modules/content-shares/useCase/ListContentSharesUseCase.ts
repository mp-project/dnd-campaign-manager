import { ValidationError } from "#core/error/http/index";
import { decodeStringCursor } from "#core/http/listResponse";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestContentSharesQueryDto } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import {
  type ResponseContentShareListDto,
  toContentShareGmResponse,
  toContentShareListResponse,
  toContentSharePlayerResponse,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

/**
 * Editors get every running share. Players get what reaches them, newest reveal first; with
 * `since`, only what is new, which is what the popup asks for.
 */
export class ListContentSharesUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestContentSharesQueryDto },
  ): Promise<ResponseContentShareListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const { db, repository } = this.sharesService;
    const { limit, cursor, since } = input.query;

    if (viewer.view === "PLAYER") {
      return this.listForPlayer(viewer, { limit, cursor, since });
    }

    await this.sharesService.deleteExpired(viewer.campaignId);

    const page = await repository.listPage(db, {
      campaignId: viewer.campaignId,
      limit,
      cursor,
      since: since ? new Date(since) : undefined,
    });
    const shareIds = page.items.map((share) => share.id);
    const [recipients, assets] = await Promise.all([
      this.sharesService.listActiveRecipients(viewer.campaignId, shareIds),
      this.assetsService.findMany(page.items.map((share) => share.assetId)),
    ]);
    const last = page.items.at(-1);

    return toContentShareListResponse({
      data: page.items.flatMap((share) => {
        const asset = assets.get(share.assetId);

        return asset
          ? [toContentShareGmResponse(share, recipients.get(share.id) ?? [], asset)]
          : [];
      }),
      last: last ? { sortValue: last.sharedAt, id: last.id } : undefined,
      hasMore: page.hasMore,
      limit,
    });
  }

  /** Few enough per player to sort in memory, because the time differs per recipient. */
  private async listForPlayer(
    viewer: { campaignId: string; actorId: string },
    query: { limit: number; cursor?: string | undefined; since?: string | undefined },
  ): Promise<ResponseContentShareListDto> {
    const received = await this.sharesService.listReceived(viewer);
    const assets = await this.sharesService.findVisibleAsset(
      viewer,
      received.map(({ share }) => share.assetId),
    );
    const after = query.cursor ? decodeStringCursor(query.cursor) : null;
    const afterTime = after ? new Date(after.value).getTime() : null;

    if (afterTime !== null && Number.isNaN(afterTime)) {
      throw new ValidationError("Invalid pagination cursor");
    }

    const since = query.since ? new Date(query.since) : null;
    const sorted = received
      .filter(({ share, revealedAt }) => assets.has(share.assetId) && (!since || revealedAt > since))
      .sort(
        (left, right) =>
          right.revealedAt.getTime() - left.revealedAt.getTime() ||
          (left.share.id < right.share.id ? 1 : -1),
      )
      .filter(({ share, revealedAt }) => {
        if (!after || afterTime === null) {
          return true;
        }

        return (
          revealedAt.getTime() < afterTime ||
          (revealedAt.getTime() === afterTime && share.id < after.id)
        );
      });
    const page = sorted.slice(0, query.limit);
    const last = page.at(-1);

    return toContentShareListResponse({
      data: page.map(({ share, revealedAt }) =>
        toContentSharePlayerResponse(share, revealedAt, assets.get(share.assetId)!),
      ),
      last: last ? { sortValue: last.revealedAt, id: last.share.id } : undefined,
      hasMore: sorted.length > query.limit,
      limit: query.limit,
    });
  }
}
