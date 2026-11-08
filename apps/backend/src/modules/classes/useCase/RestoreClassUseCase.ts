import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseClassFullDto,
  toClassFullResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import type { ClassLifecycleCommandDto } from "#src/modules/classes/domain/dto/UpdateClassDto";
import { CLASS_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

export type RestoreClassInput = {
  campaignId: string | null;
  classId: string;
  command: ClassLifecycleCommandDto;
};

/** Restores an archived class, including a release it had. */
export class RestoreClassUseCase extends MutationUseCase<RestoreClassInput, ResponseClassFullDto> {
  protected readonly action = CLASS_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly classesService: ClassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreClassInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.classesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreClassInput,
  ): Promise<ResponseClassFullDto> {
    const found = await this.classesService.requireForWrite(scope.tx, input);

    return toClassFullResponse(
      await this.classesService.restoreClass(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
