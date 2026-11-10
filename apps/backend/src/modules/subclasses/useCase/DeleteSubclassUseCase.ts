import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSubclassFullDto,
  toSubclassFullResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassLifecycleCommandDto } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import { SUBCLASS_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

export type SubclassLifecycleInput = {
  campaignId: string | null;
  subclassId: string;
  command: SubclassLifecycleCommandDto;
};

/** Archives the subclass; it can be restored. Fails while other content refers to it. */
export class DeleteSubclassUseCase extends MutationUseCase<
  SubclassLifecycleInput,
  ResponseSubclassFullDto
> {
  protected readonly action = SUBCLASS_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly subclassesService: SubclassesService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: SubclassLifecycleInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.subclassesService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: SubclassLifecycleInput,
  ): Promise<ResponseSubclassFullDto> {
    const found = await this.subclassesService.requireForWrite(scope.tx, input);

    return toSubclassFullResponse(
      await this.subclassesService.archiveSubclass(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
