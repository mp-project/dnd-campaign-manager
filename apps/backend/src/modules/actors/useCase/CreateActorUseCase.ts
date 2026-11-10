import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateActorDto } from "#src/modules/actors/domain/dto/CreateActorDto";
import {
  type ResponseActorFullDto,
  toActorFullResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import { ACTOR_ACTIONS } from "#src/modules/actors/history/TrackedActor";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";

export type CreateActorInput = { campaignId: string; command: CreateActorDto };

/** Every actor is created here, whatever its category; there are no routes per category. */
export class CreateActorUseCase extends MutationUseCase<CreateActorInput, ResponseActorFullDto> {
  protected readonly action = ACTOR_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateActorInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateActorInput,
  ): Promise<ResponseActorFullDto> {
    const record = await this.actorsService.createActor(
      scope,
      { userId: this.assetsService.assertAuthenticated(context), campaignId: input.campaignId },
      input.command,
    );

    return toActorFullResponse(record, await this.actorsService.listOwnedInstanceIds(scope.tx, record.asset.id));
  }
}
