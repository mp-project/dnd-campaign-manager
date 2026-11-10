import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSubclassDto } from "#src/modules/subclasses/domain/dto/CreateSubclassDto";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/** `campaignId` null creates a global subclass, which only administrators may do. */
export type CreateSubclassInput = { campaignId: string | null; command: CreateSubclassDto };

export class CreateSubclassUseCase extends MutationUseCase<
  CreateSubclassInput,
  ResponseSubclassFullDto
> {
  protected readonly action = SUBCLASS_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly subclassesService: SubclassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateSubclassInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.subclassesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateSubclassInput,
  ): Promise<ResponseSubclassFullDto> {
    const actorId = this.subclassesService.actorIdOf(context);

    return toSubclassFullResponse(
      await this.subclassesService.createSubclass(
        scope,
        { actorId, campaignId: input.campaignId },
        input.command,
      ),
    );
  }
}
