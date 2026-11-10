import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseBackgroundFullDto,
  toBackgroundFullResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundLifecycleCommandDto } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import { BACKGROUND_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

export type DeleteBackgroundInput = {
  campaignId: string | null;
  backgroundId: string;
  command: BackgroundLifecycleCommandDto;
};

/** Archives the background; it can be restored. Fails while other content refers to it. */
export class DeleteBackgroundUseCase extends MutationUseCase<DeleteBackgroundInput, ResponseBackgroundFullDto> {
  protected readonly action = BACKGROUND_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly backgroundsService: BackgroundsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteBackgroundInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.backgroundsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteBackgroundInput,
  ): Promise<ResponseBackgroundFullDto> {
    const found = await this.backgroundsService.requireForWrite(scope.tx, input);

    return toBackgroundFullResponse(
      await this.backgroundsService.archiveBackground(scope, {
        found,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
