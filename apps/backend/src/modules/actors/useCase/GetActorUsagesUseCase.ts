import type { RequestContext } from "#core/http/requestContext";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetLinksService, ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";

/**
 * Where the actor is used: links (factions, places, quests …), shares and content of other
 * modules. Players only see usages whose other end they may see as well.
 */
export class GetActorUsagesUseCase {
  constructor(
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
    private readonly linksService: AssetLinksService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; actorId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.actorsService.requireReadableActor(access, input);

    return this.linksService.getUsages(access, asset.id);
  }
}
