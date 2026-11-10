import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateActorDto,
  toActorFullResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import type { UpdateActorDto } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { ACTOR_ACTIONS } from "#src/modules/actors/history/TrackedActor";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";

export type UpdateActorInput = { campaignId: string; actorId: string; command: UpdateActorDto };

export class UpdateActorUseCase extends MutationUseCase<UpdateActorInput, ResponseUpdateActorDto> {
  protected readonly action = ACTOR_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateActorInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateActorInput,
  ): Promise<ResponseUpdateActorDto> {
    const { record, merged } = await this.actorsService.updateActor(scope, {
      ...input,
      userId: this.assetsService.assertAuthenticated(context),
    });
    const owned = await this.actorsService.listOwnedInstanceIds(scope.tx, record.asset.id);

    return { ...toActorFullResponse(record, owned), merged };
  }
}
