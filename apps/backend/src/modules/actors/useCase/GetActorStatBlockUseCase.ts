import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import {
  type ResponseActorStatBlockDto,
  toActorStatBlockResponse,
} from "#src/modules/actors/domain/dto/ResponseActorStatBlockDto";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";

/**
 * The computed stat block, for GMs and editors. Players don't get one yet, also not of shared
 * actors: a share reveals who an actor is, not its values. Their own character's comes with the
 * character modules.
 */
export class GetActorStatBlockUseCase {
  constructor(
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; actorId: string },
  ): Promise<ResponseActorStatBlockDto> {
    const access = await this.assetsService.access(context, input.campaignId);

    if (!access.isFullView) {
      throw new NotFoundError("Actor not found");
    }

    const found = await this.actorsService.requireReadableActor(access, input);

    return toActorStatBlockResponse(
      found,
      await this.actorsService.computeStatBlock(this.actorsService.db, found),
    );
  }
}
