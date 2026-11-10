import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseActorFullDto,
  toActorFullResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import type { ActorLifecycleCommandDto } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { ACTOR_ACTIONS } from "#src/modules/actors/history/TrackedActor";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";

export type RestoreActorInput = {
  campaignId: string;
  actorId: string;
  command: ActorLifecycleCommandDto;
};

/** Brings an archived actor back; shares ended by archiving stay ended. */
export class RestoreActorUseCase extends MutationUseCase<RestoreActorInput, ResponseActorFullDto> {
  protected readonly action = ACTOR_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreActorInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreActorInput,
  ): Promise<ResponseActorFullDto> {
    const record = await this.actorsService.restoreActor(scope, {
      campaignId: input.campaignId,
      actorId: input.actorId,
      expectedAssetVersion: input.command.expectedAssetVersion,
    });

    return toActorFullResponse(record, await this.actorsService.listOwnedInstanceIds(scope.tx, record.asset.id));
  }
}
