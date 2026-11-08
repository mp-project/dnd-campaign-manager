import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateClassDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import type { UpdateClassDto } from "#src/modules/classes/domain/dto/UpdateClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

export type UpdateClassInput = {
  campaignId: string | null;
  classId: string;
  command: UpdateClassDto;
};

export class UpdateClassUseCase extends MutationUseCase<UpdateClassInput, ResponseUpdateClassDto> {
  protected readonly action = CLASS_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly classesService: ClassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateClassInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.classesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateClassInput,
  ): Promise<ResponseUpdateClassDto> {
    const actorId = this.classesService.actorIdOf(context);
    const found = await this.classesService.requireForWrite(scope.tx, input);
    const { record, merged } = await this.classesService.updateClass(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toClassFullResponse(record), merged };
  }
}
