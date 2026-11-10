import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseActorDto,
  toActorFullResponse,
  toActorPlayerResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";

/** GMs and editors get every actor of the campaign, players only active actors shared with them. */
export class GetActorUseCase {
  constructor(
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; actorId: string },
  ): Promise<ResponseActorDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const found = await this.actorsService.requireReadableActor(access, input);

    if (!access.isFullView) {
      return toActorPlayerResponse(found);
    }

    const { db } = this.actorsService;

    return toActorFullResponse(
      await this.actorsService.loadRecord(db, found),
      await this.actorsService.listOwnedInstanceIds(db, found.asset.id),
    );
  }
}
