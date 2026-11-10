import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateSubclassDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { UpdateSubclassDto } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

export type UpdateSubclassInput = {
  campaignId: string | null;
  subclassId: string;
  command: UpdateSubclassDto;
};

export class UpdateSubclassUseCase extends MutationUseCase<
  UpdateSubclassInput,
  ResponseUpdateSubclassDto
> {
  protected readonly action = SUBCLASS_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly subclassesService: SubclassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateSubclassInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.subclassesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateSubclassInput,
  ): Promise<ResponseUpdateSubclassDto> {
    const actorId = this.subclassesService.actorIdOf(context);
    const found = await this.subclassesService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.subclassesService.updateSubclass(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toSubclassFullResponse(record), merged };
  }
}
