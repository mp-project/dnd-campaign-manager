import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateClassDto } from "#src/modules/classes/domain/dto/CreateClassDto";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/** `campaignId` null creates a global class, which only administrators may do. */
export type CreateClassInput = { campaignId: string | null; command: CreateClassDto };

export class CreateClassUseCase extends MutationUseCase<CreateClassInput, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly classesService: ClassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateClassInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.classesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateClassInput,
  ): Promise<ResponseClassFullDto> {
    const actorId = this.classesService.actorIdOf(context);

    return toClassFullResponse(
      await this.classesService.createClass(
        scope,
        { actorId, campaignId: input.campaignId },
        input.command,
      ),
    );
  }
}
